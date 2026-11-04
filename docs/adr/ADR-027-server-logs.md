# ADR-027: 서버 기록 — 로그 4종, 보관, 감사 테이블
- 상태: Accepted
- 날짜: 2026-11-04
- 근거: 사용자 요청("서버의 기록을 위한 로그 데이터도 구현") / 사용자 선택(파일 회전 + 감사 테이블) / ADR-007(관측)·008(개인정보·보관 7일)·023(IP 미저장)·025(쓰기는 트랜잭션)·026(데이터 보호)
- 관련 문서: [F17 OB-04](../design/features/17-ops-observability.md), [database-schema.md](../domains/database-schema.md), [F13](../design/features/13-events-pipeline.md)

## 맥락
설계에는 앱 로그의 형식과 마스킹(OB-04)만 있었다. 시간 기준 보관, 접근 로그의 개인정보 규칙, 관리자·보안 행위의 감사 기록, 조회 수단이 없었다. "누가 언제 무엇을 했는가"는 장애 분석과 운영 신뢰의 근거다. 단 IP는 저장하지 않고(ADR-023) 본문·토큰은 어떤 기록에도 남기지 않는다.

## 결정
1. 서버 기록을 **4종**으로 나눈다: ① 앱 로그 ② 접근 로그(nginx) ③ **감사 로그(Postgres `events.audit_log`)** ④ 운영 상태 파일(백업·배포).
2. ①②는 **컨테이너 stdout JSON → 호스트 아카이브 파일(일 단위 gzip, 7일 보관)** 이다. 별도 집계 시스템(Loki 등)은 M1 에 두지 않는다(사용자 선택).
3. ③ 감사 로그는 **DB 표**이고, 행위와 **같은 트랜잭션**에 쓴다(ADR-025). 추가 전용.
4. 모든 기록에 **IP·본문·토큰·쿠키·쿼리스트링을 남기지 않는다.** 기록 간 연결은 `trace_id`(앱·감사)와 `req_id`(접근↔앱)로 한다.

## 설계 상세

### 기록 4종
| 종류 | 위치 | 형식 | 보관 | 조회 |
|---|---|---|---|---|
| ① 앱 로그 | 컨테이너 stdout (api·ws-gateway·worker·web) | JSON 한 줄(OB-04 필드 규약) | Docker 로그 `max-size=20m`·`max-file=10` + 일 아카이브 7일 | `logq` 스크립트(jq) |
| ② 접근 로그 | nginx stdout | JSON 한 줄(아래 형식) | 위와 동일 | 위와 동일 |
| ③ 감사 로그 | Postgres `events.audit_log` | 행 | `auth` 7일, `admin`·`system` 90일(제안) | `GET /api/admin/audit`, `worker audit:list` |
| ④ 운영 상태 | `status/backup/last_success.json`, `status/deploy/*.json` | JSON 파일 | 최신 1건 + 이력 7건 | 파일 확인, 지표 |

### ② nginx 접근 로그 형식
```
log_format pf_json escape=json
  '{"ts":"$time_iso8601","method":"$request_method","uri":"$uri","status":$status,'
  '"bytes":$body_bytes_sent,"rt":$request_time,"urt":"$upstream_response_time",'
  '"rid":"$request_id","proto":"$server_protocol"}';
```
- `$uri` 는 **쿼리스트링을 포함하지 않는다**(OAuth 콜백의 `code`·`state`, 커서 등이 새지 않게). `$request_uri`·`$args` 금지.
- **넣지 않는 것**: `$remote_addr`, `$http_x_forwarded_for`, `$http_user_agent`, `$http_referer`, 쿠키, 요청 본문.
- `$request_id` 를 업스트림에 `X-Request-Id` 로 전달하고 앱 로그의 `req_id` 가 같은 값을 쓴다 → 접근 로그와 앱 로그를 연결한다.

### ① 앱 로그 정책
| 항목 | 규칙 |
|---|---|
| 형식·마스킹 | OB-04 (`Redactor` 2차선) 그대로 |
| 수준 | 운영 `info`, 개발 `debug`. `error` 는 예상 밖 예외(`unexpected`)와 영구 실패 |
| 스택 | `unexpected` 에서만, 4KB 로 자름 |
| 요청 로그 | 요청 1건당 1줄(`status`, `duration_ms`, `route` 템플릿 — 실제 경로 값이 아니라 `/api/entries/:id`) |
| 금지 | 본문, 표시 이름, 세션·행위자 ID 원문(대신 `conn_id`·`req_id`), IP, 신고 메모 |
| 용량 | 컨테이너당 최대 약 200MB(20m×10). 초과분은 오래된 것부터 삭제 |

### 아카이브 (7일 시간 기준 보관)
`infra/scripts/archive-logs.sh` (일 1회, 호스트 cron/타이머):
1. 서비스별 `docker logs --since <어제 00:00> --until <오늘 00:00>` → `/var/log/pf/archive/YYYY-MM-DD/<service>.jsonl`
2. `gzip` 후 권한 `0640`
3. 7일 지난 날짜 디렉터리 삭제
4. 결과를 `status/archive_logs/last_run.json` 에 기록 → worker 의 `StatusFileCollector` 가 `pf_ops_*` 지표로 노출(후속 결정 3)
- 아카이브는 **외부로 올리지 않고 백업 대상도 아니다**(개인정보 최소화).
- 조회 `infra/scripts/logq.sh [--app A] [--trace T] [--level L] [--since 1h] [--status 5xx]` 는 jq 래퍼로 현재 Docker 로그 + 아카이브를 읽는다.

### ③ 감사 로그 (`events.audit_log`)
| 컬럼 | 설명 | 등급 |
|---|---|---|
| `id` | bigint identity PK | SYS |
| `at` | timestamptz (`tx.now`) | SYS |
| `category` | `auth` / `admin` / `system` | SYS |
| `action` | 아래 목록 | SYS |
| `actor_role` | `anonymous` / `user` / `admin` / `system` | SYS |
| `actor_key` | `session:<id>` / `user:<id>` / NULL(system) | PSD |
| `target_type`, `target_id` | 대상(`entry`·`report`·`write_lock`·`session`…) | SYS |
| `outcome` | `success` / `denied` / `failed` | SYS |
| `reason_code` | 실패·거절 사유(고정 열거) | SYS |
| `trace_id` | 앱 로그와 연결 | SYS |
| `detail` | 작은 jsonb(개수·버전 등). **본문·IP·토큰 금지** | SYS |

- 추가 전용: 애플리케이션 경로에 UPDATE/DELETE 가 없다(보관 정리 규칙만 삭제).
- 인덱스: `(at)`, `(category, at)`, `(action, at)`.
- 쓰기 포트 `AuditWriter.record(tx, entry)` 는 `OutboxWriter` 와 같은 패턴(`events` 모듈이 소유, 다른 모듈의 usecase 가 **자기 트랜잭션 안에서** 호출). 행위가 롤백되면 감사 행도 사라진다 — "일어나지 않은 일은 기록되지 않는다".
- 조회: `GET /api/admin/audit?category&action&since&cursor`(관리자, 키셋). 웹 관리 화면은 M1 범위 밖(미결).

**기록할 행위 (M1)**
| category | action | 기록 위치 |
|---|---|---|
| auth | `login_succeeded`, `login_failed`(`reason_code`: `state_invalid`·`state_expired`·`github_rejected`·`github_unavailable`), `logout` | ID-06·07 |
| admin | `entry_hidden`, `entry_unhidden`, `report_resolved`, `write_lock_changed`, `report_note_read`, `sessions_revoked`(ID-11, 대상 수) | GB-07·08·09·10·27 |
| system | `dead_requeued`, `field_keys_rotated`, `projection_rebuilt`, `retention_ran`(삭제 건수), `retention_paused`(`detail.state`: `paused`·`resumed`·`auto_released`) | EV-07, CLI, GB-26, EV-10 |

- `entry_hidden` 등은 `moderation_action` 과 중복처럼 보이지만 **목적이 다르다**: `moderation_action` 은 도메인 이력(공개 판단 근거), `audit_log` 는 보안·운영 감사. 같은 트랜잭션에서 둘 다 쓴다.
- 반응·글 작성 같은 일반 사용자 행위는 감사 로그에 쓰지 않는다(이벤트·`trace_step` 이 담당).

### 지표·경보
`pf_audit_records_total{category,action,outcome}`, `pf_ops_last_success_timestamp{job}`, `pf_log_redactions_total`(마스킹 발동 횟수 — 코드가 금지 데이터를 로그에 넘긴 신호). 경보 후보: 아카이브 24시간 이상 미성공, 마스킹 급증, `auth.login_failed` 급증.

## 후속 결정 (2026-11-04)

최초 ADR 의 미결 4개와 알림 채널을 정했다. 상세 구성은 [F17 §16.1.1·§16.2·§16.3](../design/features/17-ops-observability.md).

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 호스트 작업 실행 수단 | **systemd 타이머**(`infra/systemd/`): archive-logs 03:10, backup 03:30, pull-deploy 5분, `Persistent=true`, `RandomizedDelaySec`, `User=pf`. cron 은 systemd 없는 호스트의 대체 | 이 호스트 init=systemd(확인). 놓친 실행 보충과 journald 기록. 세 작업이 같은 방식 |
| 2 | 로그 경로·권한 | `PF_LOG_DIR`(기본 `/var/log/pf`) `pf:pf` 0750, 파일 0640, `STATUS_DIR`(기본 `/var/lib/pf/status`). rootless Docker 면 `~/.local/state/pf/` + `systemctl --user` | 이 호스트는 rootful Docker(확인). `docker` 그룹은 root 동급이라 `pf` 는 로그인 금지(10 §5) |
| 3 | 아카이브 상태 지표 | 작업이 `status/<job>/last_run.json`(job·started_at·finished_at·ok·detail·version, + `last_success_at` 확장)을 매 실행 쓰고, **worker 의 `StatusFileCollector`** 가 읽기 전용으로 읽어 `pf_ops_last_success_timestamp{job}`·`pf_ops_last_run_ok{job}`·`pf_ops_status_age_seconds{job}` 노출. 이전 지표 `pf_log_archive_last_success_timestamp` 는 대체 | Pushgateway·node_exporter 없이 백업·배포·아카이브를 한 규약으로. 매 실행 기록이라 타이머 정지도 감지 |
| 4 | 감사 보관 | `auth` 7일, `admin`·`system` **90일 확정** | `auth` 는 ADR-008 의 세션·로그 7일과 동일, 관리 조치는 분기 검토 주기에 맞춤. 운영 후 조정 가능 |
| 5 | 로그인 실패 경보 | `sum(increase(pf_auth_login_failed_total[10m])) >= 10` → warn. 별도로 `github_unavailable` 5분 3회 → warn. 아카이브·백업 정체는 **26시간**(24h + 유예 2h) | 동시 접속 50 규모에서 정상 실패는 시간당 1건 미만이라는 **미측정 추정**. 운영 후 조정 |
| 6 | 알림 채널 | **Discord 웹훅**(Grafana 연락처). 시크릿 `DISCORD_WEBHOOK_URL` 은 grafana 컨테이너에만 주입. `repeat_interval` 4h, 해소 알림 켬, `info` 는 대시보드만 | 사용자 선택. 무료·카드 불필요. Alertmanager 는 두지 않음(컨테이너 절약) |
| 7 | 감사 조회 웹 화면 | **M1 밖**(백로그 WB-22). API 와 CLI 만 | 관리자가 한 명 |

**검증 상태**: 1·2 는 이 호스트(WSL2)의 init/Docker 구성을 확인했으나 실제 집 PC·Oracle 호스트는 S8-1 에서 재확인한다. 6 의 Discord 연락처·Grafana 프로비저닝의 `$__file{}` 시크릿 확장은 **미검증**(S7-6). 5 의 수치는 추정.

### 실측 확인 (2026-11-04)

로컬(WSL2, Grafana 13.3.0, promtool 3.15.1, systemd 255, Docker 29.8 rootful)에서 후속 결정의 미확인 항목을 실행했다. 상세는 [F17](../design/features/17-ops-observability.md) §3.2·§16.1.0·§16.1.1·§16.3·§17.

| 항목 | 결과 | 설계 반영 |
|---|---|---|
| Grafana 시크릿 확장 | `$__file{}` 과 `${VAR}` 모두 프로비저닝 YAML 에서 동작(Discord 전송 확인, 가짜 수신 서버). 시크릿 누락 시 **alerting 프로비저닝 전체 실패** | 개발 모드는 프로비저닝 미마운트/미생성으로. 운영은 배포 전 점검 |
| 시험 알림 API | 13.3 에서 구 경로 제거, 새 경로의 `{uid}` 는 연락처 이름 base64url | F17 §16.3 |
| 경보 식 | `promtool check/test rules` 통과. **카운터 선초기화 없으면 첫 건 유실**(실제 10건 → increase 9.45 → 불발). 표의 `\|` 를 규칙 파일에 옮기면 영구 불발 | 선초기화 의무(F17 §3.2), 정본 규칙은 `|` |
| systemd 유닛 | 문법 통과, `OnCalendar` 는 호스트 로컬 시간대. **`ReadWritePaths=$VAR` 는 무시됨** | 설치 스크립트가 절대 경로로 치환(`@PF_LOG_DIR@`) |
| 아카이브 스크립트 | 범위/gzip/권한/`flock` 동작 확인. `date "+ 1 day"` 8시간 오차, `2>&1` 순서 비보존 | F17 §16.1.0 규칙 3개 |
| docker 그룹 | 읽기 전용 마운트로 호스트 `/etc/shadow` 메타데이터가 root 권한으로 보임(내용은 읽지 않음) = root 동급 입증. rootless 는 `uidmap` 하나 없음(설치에 sudo 필요) | 10 §5 대안 표, 결정은 S8-1 |
| 임계값 | 규칙이 의도대로 울리고 꺼지는 것만 확인. **값의 적절성은 트래픽 데이터 없이 판단 불가** | 운영 후 조정 |
| `pf` 사용자 실제 권한 | root 없이 확인 불가 | S8-1 |

## 대안과 기각 이유
- **Loki + Grafana 검색**: 검색은 좋지만 컨테이너 2개와 수백 MB, 공개 대시보드와 로그 접근 분리 설계가 필요하다(사용자 선택에서 제외). 재검토 조건에 둔다.
- **앱 로그를 DB 표에**: 쓰기 부하가 정본 DB 성능을 해치고 장애 시 로그도 함께 사라진다.
- **앱이 직접 일 단위 파일 회전**: 파일 핸들·회전 로직을 앱이 가진다. stdout 규약(12-factor)을 유지하고 호스트가 수집하는 쪽이 단순하다.
- **감사 로그를 파일로**: 행위와 원자적이지 않아 "일어나지 않은 일이 기록"될 수 있다.

## 결과
- 얻는 것: 시간 기준 보관, 개인정보 없는 접근 로그, 행위와 원자적인 감사 기록, 조회 수단.
- 치르는 것: 아카이브 스크립트·cron 운영, `AuditWriter` 포트와 테이블 추가, 각 usecase 에 감사 호출 한 줄.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 로그에 금지 데이터가 샘 | `Redactor` 2차선, 시험(센티널 문자열 부재), `pf_log_redactions_total`, nginx 형식에서 원천 제외 |
| 아카이브가 돌지 않아 유실 | 마지막 성공 시각 지표·경보, Docker 로그 크기 상한이 안전망 |
| 디스크 가득 | 컨테이너당 200MB 상한 + 7일 삭제, 디스크 사용량 지표 |
| 감사 로그가 커짐 | 카테고리별 보관(7/90일), 배치 삭제(ADR-025) |
| 로그 파일 접근 | 권한 0640, 외부 업로드·백업 제외 |

## 검증 방법
- 단위: `Redactor` 거부목록·패턴. 감사 기록이 행위와 같은 트랜잭션(롤백 시 사라짐).
- 통합: `?code=SECRET&state=X` 요청 뒤 접근 로그에 쿼리·IP 부재, `req_id` 로 접근↔앱 연결.
- 운영: 아카이브 스크립트 7일 삭제, 감사 보관 규칙 동작.
- 상태 파일: 파일 없음/오래됨/`ok=false` 를 구분하는 `StatusFileCollector` 시험, 경보 규칙 `promtool test`.

## 실서비스라면
중앙 로그 집계(Loki/ELK)와 변조 방지 저장(WORM), 알림 연동, SIEM 으로 감사 로그를 내보낸다.

## 재검토 조건
로그 검색 요구가 `jq` 로 감당되지 않을 때(Loki 도입). 감사 대상 행위가 늘 때. 로그 보관 기간 변경 요구.

## 관련 ADR
ADR-007, ADR-008, ADR-023, ADR-025, ADR-026
