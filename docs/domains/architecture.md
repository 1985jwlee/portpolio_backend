# 아키텍처

시스템이 어떻게 나뉘고, 요청과 이벤트가 어디를 지나며, 어디서 어긋날 수 있는가.
**경계와 흐름만** 다룬다 — 테이블 컬럼은 [database-schema.md](database-schema.md), 결정의 이유는 ADR 이 정본이다.
코드가 아직 없으므로 모든 이름은 **설계 이름**이다. 구현하면서 달라지면 이 문서를 먼저 고친다.

대상 범위는 **M1**이다. 후속 Phase 는 §12 에서 확장 지점만 밝힌다.

## 1. 기본 아키텍처 (모든 모듈이 따르는 네 가지)

| 기둥 | 한 줄 | ADR |
|---|---|---|
| **모듈러 모놀리스** | 단일 코드베이스, 엔트리포인트(api/ws-gateway/worker)만 다름 | 001 |
| **CQRS** | 명령은 쓰기 모델, 조회는 읽기 모델(프로젝션). 읽기 모델은 이벤트로만 갱신 | 018 |
| **domain · service · usecase** | usecase → service → domain 한 방향. 명령/조회 한 건 = usecase 하나 | 019 |
| **outbox + inbox** | 보내는 쪽은 쓰기와 같은 트랜잭션에 outbox, 받는 쪽은 inbox 에 저장 후 처리 | 005, 020 |
| (횡단) **동시성 제어** | 처리 전 조건부 UPDATE 로 `processing` 선점, 임대·토큰, 낙관적 버전 | 021 |

## 2. 구성 요소와 경계

```mermaid
flowchart TB
    Visitor["방문자 브라우저"]
    subgraph Edge["진입 (호스트별로 다름)"]
        Tunnel["cloudflared<br>집 PC 전용"]
        Proxy["proxy<br>경로 라우팅 · 접속 주소 정규화"]
    end
    subgraph App["애플리케이션 (같은 이미지, 엔트리포인트만 다름)"]
        Web["web<br>Next.js"]
        Api["api<br>명령 · 조회 HTTP"]
        Ws["ws-gateway<br>WebSocket"]
        Worker["worker<br>디스패처 · 처리 워커 · 정리"]
    end
    subgraph Data["데이터 (Postgres 한 인스턴스)"]
        WModel[("쓰기 모델<br>모듈 스키마 + outbox + inbox")]
        RModel[("읽기 모델<br>*_read 스키마")]
    end
    subgraph Obs["관측"]
        Prom["prometheus"]
        Graf["grafana<br>공개 대시보드 · 읽기 전용"]
    end

    Visitor -->|"HTTPS"| Tunnel
    Visitor -.->|"HTTPS: 오라클 경로"| Proxy
    Tunnel -->|"HTTP"| Proxy
    Proxy -->|"HTTP: /"| Web
    Proxy -->|"HTTP: /api"| Api
    Proxy -->|"WebSocket: /ws"| Ws
    Proxy -->|"HTTP: /grafana"| Graf
    Web -->|"HTTP: 서버 렌더링 데이터"| Api
    Api -->|"SQL: 명령 = 쓰기 모델 + outbox 한 트랜잭션"| WModel
    Api -->|"SQL: 조회 = 읽기 모델만"| RModel
    Worker -->|"SQL: outbox 선점 · 전달 · inbox 처리 · 정리"| WModel
    Worker -->|"SQL: 프로젝터가 읽기 모델 갱신"| RModel
    Worker -.->|"내부 알림: 변경 발생"| Ws
    Ws -->|"SQL: 재접속 복구용 이력 조회"| RModel
    Prom -->|"HTTP: 지표 수집"| Api
    Prom -->|"HTTP: 지표 수집"| Ws
    Prom -->|"HTTP: 지표 수집"| Worker
    Graf -->|"PromQL"| Prom
```

- 점선은 **비동기·조건부**다.
- `cloudflared` 는 집 PC 경로에만 있다. Oracle 경로에서는 방문자가 `proxy` 로 직접 온다(TLS 종료를 `proxy` 가 맡는다).
- `worker` 는 `change_log` 에 쓰며 `NOTIFY` 로 깨우고, `ws-gateway` 가 `change_log` 를 읽어 보낸다(1초 폴링 보완, ADR-023). **`ws-gateway` 는 읽기 모델을 읽어 복구**할 수 있다.
- 읽기 모델과 쓰기 모델은 **같은 Postgres 인스턴스의 다른 스키마**다(논리 분리, ADR-018).

## 3. 컨테이너 책임

| 구성 | 책임 | 상태 | 비고 |
|---|---|---|---|
| `proxy` | 경로 라우팅, TLS 종료(Oracle), **원 접속 주소를 한 헤더로 정규화**, 접속 주소별 속도 제한 | 무상태 | **nginx**(ADR-022, 관문 G7) |
| `web` | 화면 렌더링(소개·아키텍처는 서버 렌더링, 데모는 클라이언트) | 무상태 | ko/en. Bun 실행(관문 G3, 실패 시 Node 22) |
| `api` | 인증, **명령 usecase**(쓰기)와 **조회 usecase**(읽기) 실행 | 무상태 | 명령은 outbox 기록까지 |
| `ws-gateway` | 연결 유지, 구독, 브로드캐스트, 재접속 복구 | **연결을 쥔다** | 재시작 시 클라이언트 재접속(ADR-014) |
| `worker` | 디스패처(동시 하나만 활성), 처리 워커(inbox), 회수 작업, 정리 | 무상태(락·임대로 조정) | |
| `postgres` | 정본(쓰기 모델) + 읽기 모델 | 상태 | 볼륨 필수 |
| `prometheus` / `grafana` | 지표 수집 / 공개 대시보드 | 상태(보존 기간 제한) | ADR-007 |

## 4. 모듈 내부 구조 (domain · service · usecase)

모든 모듈이 같은 모양이다(ADR-019).

```
modules/<name>/
  domain/            엔티티 · 값 객체 · 도메인 이벤트 · 불변식 (순수)
  service/           여러 엔티티에 걸친 도메인 규칙 (순수)
  usecase/
    command/         명령 한 건 = 파일 한 개   ← 트랜잭션 경계
    query/           조회 한 건 = 파일 한 개   ← 읽기 모델만
    event/           수신 메시지 처리 (프로젝터 · 소비자)
  port/              저장소 · outbox · inbox · 시계 · 식별자 (인터페이스)
  adapter/           포트 구현 (postgres …)
  index              모듈 공개 API
```

| 규칙 | 내용 |
|---|---|
| 의존 방향 | **usecase → service → domain.** 역방향 금지. adapter 는 port 를 구현하고, 조립은 엔트리포인트에서 |
| domain · service | I/O·시간·난수 직접 호출 금지. DB 없이 단위 시험 |
| usecase | 트랜잭션을 열고 닫는 유일한 곳. SQL 을 직접 쓰지 않는다(포트 사용) |
| 쓰기 포트 vs 읽기 포트 | `command` 는 쓰기 포트만, `query` 는 읽기 포트만 주입받는다 → **구조로 CQRS 가 강제**된다 |
| 엔트리포인트 | 입력 검증 → usecase 호출 → 응답 매핑. 규칙 없음 |
| 모듈 간 호출 | 상대 모듈의 `index` 가 내보낸 usecase 만. 상대의 domain·adapter·테이블 직접 참조 금지 |

### 모듈 지도 (M1)

| 모듈 | 쓰기 스키마 | 읽기 스키마 | 소비자 / 프로젝터 | 의존할 수 있는 것 |
|---|---|---|---|---|
| `identity` | `identity` | — | — | `db`, `config` |
| `guestbook` | `guestbook` | `guestbook_read` | `guestbook-projector` | `identity` 공개 usecase(세션 확인), `events` 공개 포트(outbox 기록) |
| `events` | `events` | `events_read` | — (주기 집계) | `db`, `protocol` |
| `realtime` | `realtime`(inbox) | `realtime_read` | `realtime-broadcaster` | `identity` 공개 usecase, `protocol` |
| `observability` | — | — | — | `config` |

순환 의존 금지. 위반은 CI 의 임포트 경계 검사로 실패시킨다(ADR-001).

## 5. 요청 경로 (M1 초안)

REST 와 WebSocket 계약의 **정본은 `packages/protocol`** 이다. 아래는 종류의 지도다.

### REST — 명령 (`usecase/command`)
| 경로 | 인증 | 하는 일 |
|---|---|---|
| `POST /api/entries` | 익명 허용 | `PostEntry`: 글 저장 + outbox |
| `PATCH` / `DELETE /api/entries/{id}` | **로그인 + 본인** | `EditEntry`·`DeleteEntry`: **`version` 조건 갱신**, 어긋나면 409 |
| `PUT` / `DELETE /api/entries/{id}/reactions/{emoji}` | 익명 허용 | `AddReaction`·`RemoveReaction`: 유일 키가 중복 심판 |
| `POST /api/entries/{id}/reports` | 익명 허용 | `ReportEntry` |
| `POST /api/admin/entries/{id}/hide` · `unhide` | **허용목록 관리자** | `HideEntry`: 버전 조건 갱신 + 조치 이력 + outbox |
| `POST /api/admin/reports/{id}/resolve` | 관리자 | `ResolveReport`: `open → resolved` 조건부 갱신 |
| `GET /api/auth/github` · `/callback`, `POST /api/auth/logout` | — | 로그인 흐름 |

**모든 쓰기 요청은 클라이언트가 만든 요청 식별자를 받는다.** 같은 식별자의 재요청은 같은 결과를 돌려준다(ADR-014, 연결이 끊긴 사이 재시도 안전).

### REST — 조회 (`usecase/query`)
| 경로 | 인증 | 읽는 곳 |
|---|---|---|
| `GET /api/entries` | 익명 허용 | `guestbook_read.entry_view` (커서) |
| `GET /api/me` | 로그인 | 세션 확인(명령 쪽 보조 조회, 예외) |
| `GET /api/admin/reports` | 관리자 | `guestbook_read.report_queue` |
| `GET /healthz`, `GET /readyz`, `GET /metrics` | **내부 전용** | probe·지표. 프록시에서 외부 차단 |

### WebSocket
| 채널 | 방향 | 메시지 종류(초안) |
|---|---|---|
| `/ws/public` | 서버 → 클라이언트 | 글 생성·수정·제거, 반응 변경, **전체 익명 흐름 요약**, 접속자 수. **최초 진입 시 연결**, 인증 불필요 |
| `/ws/private` | 서버 → 클라이언트 | **내 흐름 상세**(단계 기록). **세션 확인 후 연결**(익명 세션 포함), 세션 쿠키 필수 |
| 클라이언트 → 서버 | — | `hello`(public 은 마지막 수신 순번을 담은 재개 요청), `ping` |

**public 과 private 은 서로 다른 연결**이다(한 탭에 소켓 둘). 메시지 봉투·종료 코드는 [design/04](../design/04-ws-protocol.md).

## 6. 핵심 흐름: 글 작성에서 화면 반영까지

M1 의 중심 시나리오다. 시각화가 보여주는 것이 바로 이 흐름이다.

```mermaid
sequenceDiagram
    participant B as 브라우저
    participant A as api 명령 usecase
    participant D as 쓰기 모델
    participant P as 디스패처
    participant I as inbox
    participant W as 처리 워커
    participant R as 읽기 모델
    participant G as ws-gateway

    B->>A: POST /api/entries (요청 식별자 포함)
    A->>D: 한 트랜잭션: 글 저장 + outbox 기록 + 단계 written
    A-->>B: 201 생성된 글 뷰 + 추적 id
    Note over A,D: 여기까지가 동기 구간 (강한 일관성)
    P->>D: outbox 선점 (new 에서 processing)
    P->>I: 구독 모듈 수신: inbox 저장 (중복은 무시)
    P->>D: 토큰 조건으로 published
    W->>I: inbox 선점 (received 에서 processing)
    W->>R: 같은 트랜잭션: 읽기 모델 갱신 (순번 검사) + inbox 처리 완료
    W-->>G: 변경 알림
    G->>R: 변경 이력 기록 (채널 순번 부여)
    G-->>B: 글 생성 메시지 (public) · 내 흐름 단계 (private)
```

- **동기 구간은 저장까지**다. 응답 시간 목표(p95 300ms)는 이 구간에 걸린다.
- 이후는 **결과적 일관성**이다. 쓴 직후 목록 조회에 아직 없을 수 있으므로, 명령 응답에 생성된 뷰를 담아 주고 클라이언트가 공개 메시지와 **중복 없이 병합**한다(ADR-018).
- 소비가 실패하면 재시도·`dead` 로 격리되고 같은 경로로 시각화에 나타난다(ADR-005·020).

## 7. 동시성 제어 지점

모든 "한 번만"은 같은 모양이다: **조건부 UPDATE 로 `processing` 선점 → 처리 → 토큰 일치 조건으로 완료**(ADR-021).

| 지점 | 장치 | 충돌 시 |
|---|---|---|
| outbox 전달 | 단일 활성 디스패처(어드바이저리 락) + 항목 선점 + 토큰 완료 | 다른 인스턴스는 건너뜀 |
| inbox 처리 | PK 로 중복 수신 차단, 항목 선점 + 토큰 완료 | 중복은 무시, 선점 실패는 건너뜀 |
| 임대 만료 | 회수 작업이 `processing` 을 기대 상태로 되돌림 | 늦게 온 이전 주체의 완료는 0행으로 거절 |
| 글 수정·숨김 | `version` 조건 갱신 | 409 + 최신 상태 |
| 반응 추가 | 유일 키 | 중복은 409 |
| 신고 처리 | `open → resolved` 조건부 갱신 | 한 명만 성공 |
| 읽기 모델 갱신 | 행의 `last_seq` 비교 | 오래된 이벤트 무시 |
| 외부 호출(후속 Phase) | 선점 트랜잭션과 완료 트랜잭션 사이에 호출, 호출 동안 행 잠금 없음 | |

**효과 자체도 멱등**이어야 한다. 토큰은 상태 덮어쓰기를, 멱등은 효과 중복을 막는다 — 둘 다 필요하다.

## 8. 신뢰 경계와 보안 지점

| 경계 | 무엇을 믿고 무엇을 의심하는가 |
|---|---|
| 인터넷 → 프록시 | 모든 입력을 의심. 접속 주소 헤더는 **프록시가 지우고 다시 쓴다** |
| 프록시 → 앱 | 프록시가 넣은 정규화 헤더만 신뢰. 앱은 프록시 외 경로로 직접 노출하지 않는다 |
| 브라우저 → api/ws | 세션 쿠키로 신원 확인. 영구 쓰기는 로그인 필요. 관리 경로는 허용목록 |
| 앱 → 앱 | 같은 이미지·같은 네트워크. 내부 경로(`/metrics`, `/readyz`)는 외부 비공개 |
| 앱 → DB | 모듈은 자기 스키마(`<m>`, `<m>_read`)만. 조회 usecase 는 `_read` 만(구조로 강제). (구현 시) 역할 분리 검토 |
| 방문자 ↔ 방문자 | 다른 방문자의 글 내용·식별자는 요약 경로로 새지 않는다(서버에서 가공, AC-009) |
| 공개 Grafana | 보기 전용·프로비저닝된 대시보드만. 지표 레이블에 식별자 금지(ADR-007) |
| 외부 메시지(Phase 5 웹훅) | 서명 검증을 수신 usecase 첫 단계에서. 틀리면 inbox 에 저장하지 않는다(ADR-020) |

## 9. 배포 토폴로지

```mermaid
flowchart LR
    subgraph Home["집 PC (1차)"]
        HCF["cloudflared"] --> HStack["Compose 한 벌"]
    end
    subgraph Oracle["Oracle Always Free (이전 대비)"]
        OStack["Compose 한 벌<br>proxy 가 TLS 종료"]
    end
    subgraph K3d["로컬 k3d (검증 전용)"]
        KStack["같은 이미지<br>Gateway API · probe · PDB"]
    end
    CI["GitHub Actions"] -->|"이미지 푸시: GHCR"| Registry["GHCR"]
    Registry -->|"pull"| HStack
    Registry -->|"pull"| OStack
    Registry -->|"pull"| KStack
    Fallback["정적 폴백<br>소개 · 아키텍처"]
    Visitor["방문자"] -->|"도메인"| HCF
    Visitor -.->|"원본 응답 없음"| Fallback
```

- 세 환경 모두 **같은 이미지**를 쓴다. 차이는 설정과 오버라이드 파일뿐이다(ADR-002).
- 정적 폴백은 데모 영역을 제외한다(ADR-003, FR-070). 폴백은 2단계다: nginx 정적 페이지(앱 다운), Cloudflare 정적 미러(호스트 다운, 관문 G11) — ADR-023.

## 10. 장애 모드

| 무엇이 죽으면 | 방문자가 보는 것 | 시스템이 하는 일 |
|---|---|---|
| 집 PC·회선 | 소개·아키텍처(정적 폴백), 데모는 '점검 중' | 복구 후 자동 재개. Oracle 이전은 수동 |
| `api` | 쓰기 실패 메시지, 읽기는 일시 불가 | 재시작. 명령은 트랜잭션이라 반쪽 저장 없음 |
| `ws-gateway` | 연결 끊김 표시 → 자동 재접속 | 순번 기반으로 놓친 변경 복구 또는 스냅샷(ADR-014) |
| `worker` | 글은 저장되나 읽기 모델 반영·시각화가 늦어짐 | outbox·inbox 가 쌓임. 재시작·임대 만료 후 이어서 처리. 적체·지연 지표가 오름 |
| 프로젝터 버그로 읽기 모델 오염 | 목록이 잘못 보임 | 읽기 모델을 비우고 정본·이벤트로 **재구성** |
| `postgres` | 전체 쓰기·읽기 불가 | 볼륨 복구 또는 백업 복원(일별 7·주별 4, 외부 보관, ADR-023) |
| `prometheus`/`grafana` | 대시보드만 비어 있음 | 사이트 기능에는 영향 없음 |
| 터널의 WebSocket 미통과(🔴 미확인) | 실시간 갱신 안 됨 | 구현 초기 실측 후 대체 방식 결정(ADR-003) |

## 11. 측정할 것 (지표 지도)

| 영역 | 지표 |
|---|---|
| 명령/조회 | `http_request_duration_seconds`, 에러율 |
| outbox | `outbox_new`, `outbox_dead_total`, `oldest_processing_age_seconds` |
| inbox / 읽기 모델 | `inbox_depth`, `inbox_oldest_age_seconds`, `projection_lag_seconds`, `projection_drift` |
| 동시성 | 선점 실패 수, 임대 만료 회수 수, 409(버전 충돌) 수 |
| 실시간 | `ws_connections`, `ws_reconnects_total` |

## 12. 확장 지점 (Phase 별)

| 단계 | 추가되는 것 | 이 구조에서 바뀌는 곳 |
|---|---|---|
| Phase 1 | `game` 모듈, 룸·대국 채널 | `ws-gateway` 에 비공개 채널, 서버 권위 상태머신(`version` 조건 갱신), `game_read` |
| Phase 2 | KataGo 분석 워커, `ledger` | `worker` 계열이 분석 워커로 분화(선점→트랜잭션 밖 분석→토큰 완료), 전달 계층 결정(ADR-006) |
| Phase 3 | `deal`, Redis(이음새는 ADR-024) | `api` 에 재고 선점 경로(ADR-010), Redis 컨테이너 |
| Phase 5 | `payment`, `pricefeed`, 웹훅 | 웹훅은 inbox 로 수신, 시세 수집 작업 |

**바뀌지 않는 것**: 모듈 경계 규칙, domain·service·usecase 의존 방향, CQRS(조회는 읽기 모델만), outbox/inbox 규약, 선점 규약, 프록시 + 경로 라우팅, 같은 이미지 원칙.

## 13. 미결

| 항목 | 결정 시점 |
|---|---|
| nginx 이미지의 `realip` 포함 여부, Oracle 경로 TLS 자동화 방식 | 관문 G7 (구현 단계 0) |
| 임대·백오프 초기값 조정 | 처리 시간 측정 후(규칙·초기값은 ADR-023) |
| 복구 시험 수행 | M1 후반(방식은 ADR-023, 외부 저장소는 G12) |
| Cloudflare 정적 미러 수단 | 관문 G11 |
| 경계 검사 규칙 파일 작성(dependency-cruiser, 계층·CQRS 규칙) | 구현 단계 0 |
