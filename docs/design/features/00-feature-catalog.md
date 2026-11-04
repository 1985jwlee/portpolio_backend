# F00. 기능 카탈로그 (세분화)

M1 에서 만들 **모든 기능을 ID 로 분해**한 정본 목록이다. 상세 설계(클래스·시퀀스·순서도)는 아래 "상세" 열의 문서에 있고, 문서 사이의 이름은 이 표와 [00](../00-system-overview.md)의 기반 클래스를 따른다.
요구(FR/AC)는 [spec](../../../specs/portfolio-site.spec.md), 작업(S*)은 [11](../11-implementation-plan.md).

| 접두 | 영역 | 상세 문서 |
|---|---|---|
| `ID` | identity (세션·로그인·권한) | [F10](10-identity.md) |
| `GB` | guestbook (명령·조회·프로젝션) | [F11](11-guestbook-write.md) · [F12](12-guestbook-read.md) |
| `EV` | events (outbox·inbox·디스패처·추적·집계·정리) | [F13](13-events-pipeline.md) |
| `RT` | realtime (broadcaster·ws-gateway) | [F14](14-realtime.md) |
| `WB` | web (화면·컴포넌트·클라이언트 상태) | [F15](15-web.md) |
| `CM` | 공통 (가드·멱등·오류·설정·UoW·조립·시드) | [F16](16-cross-cutting.md) |
| `OB` | 운영 (지표·로그·프록시·폴백·백업·배포·CI) | [F17](17-ops-observability.md) |

> 각 상세 문서 끝의 "수정 요청" 절은 작성 시점의 **이력**이다. 요청은 2026-11-04 에 정본 문서(database-schema, 00, 03~06, 08~10, 12 등)에 반영되었고, 충돌 시 정본이 우선한다.

각 상세 문서는 공통 형식을 따른다: ① 모듈 아키텍처 다이어그램 ② 통합 클래스 다이어그램(필드·메서드·상속) ③ 기능별 절 — 목적·트리거·사전/사후 조건·접근 테이블·**클래스**·**시퀀스(정상+실패)**·**순서도**·오류·지표/로그·시험(08 연결).

## 1. identity (ID)

| ID | 기능 | 트리거 | usecase / 주요 클래스 | 접근 테이블 | 요구 | 작업 |
|---|---|---|---|---|---|---|
| ID-01 | 익명 세션 발급 | `GET /api/me` (쿠키 없음/무효) | `IssueAnonymousSession`, `SessionService` | `identity.session` W | FR-010 | S2-1,2 |
| ID-02 | 세션 해석 | 모든 요청 가드, gateway private 업그레이드 | `ResolveSession`, `TokenHasher` | `session` R | FR-010 | S2-1 |
| ID-03 | 세션 갱신(슬라이딩) | ID-02 에서 1시간 경과 시 | `TouchSession`(usecase) | `session` W | FR-010 | S2-1 |
| ID-04 | 내 정보 조회 | `GET /api/me` | `GetMe` | `session`·`user_account` R | FR-010,011 | S2-2 |
| ID-05 | GitHub 로그인 시작 | `GET /api/auth/github` | `BeginGithubLogin`, `OAuthStateCodec` | — (서명 쿠키) | FR-011 | S2-3 |
| ID-06 | GitHub 로그인 완료 | `GET /api/auth/github/callback` | `CompleteGithubLogin`, `GithubClient` | `user_account` W, `session` W/D | FR-011 | S2-3 · 감사: `auth.login_succeeded`/`login_failed` |
| ID-07 | 로그아웃 | `POST /api/auth/logout` | `Logout` | `session` D | FR-011 | S2-3 · 감사: `auth.logout` |
| ID-08 | 표시 이름 변경 | `PUT /api/me/profile` | `UpdateProfile` | `user_account` W | FR-011 | S2-3 |
| ID-09 | 관리자 판정 | ID-04/가드 | `AdminPolicy` | — (설정) | FR-012 | S2-4 |
| ID-10 | 만료 세션 정리·익명화 | worker 잡 | `PurgeExpiredSessions` — **worker 잡이 두 모듈의 공개 usecase 를 차례로 호출**: `identity.ListExpiredSessionIds` → `guestbook.AnonymizeSessionData`(GB-12) → `identity.DeleteSessions` | `session` D, (GB-12 경유) `entry`·`reaction` W | FR-080, AC-011 | S6-6 |

## 2. guestbook 명령 (GB, 쓰기)

| ID | 기능 | 트리거 | usecase | 접근 테이블(한 트랜잭션) | 이벤트 | 요구 | 작업 |
|---|---|---|---|---|---|---|---|
| GB-01 | 글 작성 | `POST /api/entries` | `PostEntry` | `entry` W, `request_key` W, `outbox_event` W, `trace_step` W | `entry.posted` | FR-020,024 / AC-001,002 | S3-1,2 |
| GB-02 | 글 수정 | `PATCH /api/entries/{id}` | `EditEntry` | `entry` W(version 조건), outbox, request_key | `entry.edited` | FR-022,034 / AC-005,016 | S6-2 |
| GB-03 | 글 삭제 | `DELETE /api/entries/{id}` | `DeleteEntry` | `entry` W(soft), outbox, request_key | `entry.deleted` | FR-022 / AC-005 | S6-2 |
| GB-04 | 반응 추가 | `PUT …/reactions/{emoji}` | `AddReaction` | `reaction` W(유일 키), outbox, request_key | `reaction.changed` | FR-021 | S6-1 |
| GB-05 | 반응 취소 | `DELETE …/reactions/{emoji}` | `RemoveReaction` | `reaction` D, outbox, request_key | `reaction.changed` | FR-021 | S6-1 |
| GB-06 | 신고 | `POST …/reports` | `ReportEntry` | `report` W, outbox, request_key | `report.filed` | FR-023 | S6-3 |
| GB-07 | 숨김 | `POST /api/admin/entries/{id}/hide` | `HideEntry` | `entry` W(version), `moderation_action` W, outbox | `entry.hidden` | FR-023 / AC-006 | S6-3 · 감사: `admin.entry_hidden` |
| GB-08 | 숨김 해제 | `POST …/unhide` | `UnhideEntry` | 위와 동일 | `entry.unhidden` | FR-023 | S6-3 · 감사: `admin.entry_unhidden` |
| GB-09 | 신고 처리 | `POST /api/admin/reports/{id}/resolve` | `ResolveReport` | `report` W(`open→resolved` 조건부), outbox | `report.resolved` | FR-023 | S6-3 · 감사: `admin.report_resolved` |
| GB-10 | 쓰기 잠금 스위치 | `POST /api/admin/write-lock` | `SetWriteLock` | `guestbook.write_lock` W(신규) | — | ADR-008/023 | S6-4 · 감사: `admin.write_lock_changed` |
| GB-11 | 쓰기 잠금 검사 | GB-01,02,04,06 진입 | `WriteLockPolicy` | `write_lock` R | — | ADR-008 | S6-4 |
| GB-12 | 세션 데이터 익명화 | worker ID-10 잡이 호출 | `AnonymizeSessionData`(guestbook 공개 usecase) | `entry`·`reaction` W(쓰기 모델) + `entry_view`·`my_reaction` W(**이벤트 없이 직접 쓰는 보관 정리 예외**) | — | FR-080 / AC-011 | S6-6 |

## 3. guestbook 조회·프로젝션 (GB, 읽기)

| ID | 기능 | 트리거 | usecase / 클래스 | 접근 테이블 | 요구 | 작업 |
|---|---|---|---|---|---|---|
| GB-20 | 글 목록 조회 | `GET /api/entries` | `ListEntries` | `entry_view` R, `my_reaction` R | FR-035 | S3-6 |
| GB-21 | 신고 큐 조회 | `GET /api/admin/reports` | `ListReports` | `report_queue` R | FR-023 | S6-3 |
| GB-22 | 충돌 시 최신 뷰 조회(명령 쪽) | 409 생성 시 | `LoadEntryForConflict` | `entry` R | FR-034 | S6-2 |
| GB-23 | entry 계열 프로젝션 | inbox `entry.*` | `GuestbookProjector.onEntry*` | `entry_view` W | FR-035 / AC-017 | S3-5 |
| GB-24 | 반응 프로젝션 | inbox `reaction.changed` | `onReactionChanged` | `entry_view.reactions`·`my_reaction` W | FR-021,035 | S6-1 |
| GB-25 | 신고 프로젝션 | inbox `report.*` | `onReport*` | `report_queue` W | FR-023 | S6-3 |
| GB-27 | 신고 메모 복호화 조회(관리자) | `GET /api/admin/reports/{id}/note` | `GetReportNote`, `FieldCipher` | `report` R(쓰기 모델, 명령 쪽 읽기 예외) | ADR-026 | S6-3 · 감사: `admin.report_note_read` |
| GB-26 | 읽기 모델 재구성 | worker CLI `rebuild` | `RebuildEntryView`, `ProjectionState` | `entry_view_next` W, `projection_state` W | AC-017 / ADR-023 | S6-5 · 감사: `system.projection_rebuilt` |

## 4. events (EV)

| ID | 기능 | 트리거 | 클래스 | 접근 테이블 | 요구 | 작업 |
|---|---|---|---|---|---|---|
| EV-01 | 이벤트 기록(outbox append) | 명령 usecase 내부 | `OutboxWriter`, `EventCodec` | `outbox_event` W | FR-020 / AC-002 | S3-2 |
| EV-02 | 디스패처(리더 선출·선점·전달·발행완료) | worker 루프 | `OutboxDispatcher`, `AdvisoryLeader` | `outbox_event` W, 각 모듈 `inbox_message` W | FR-030,033 / AC-015 | S3-3 |
| EV-03 | 메시지 수신 | 디스패처 → 구독 모듈 | `ReceiveMessage`(모듈별) | `inbox_message` W | FR-031 / AC-003 | S3-4 |
| EV-04 | 메시지 처리 러너(선점·핸들러·완료) | worker 루프 | `MessageRunner`, `ClaimToken` | `inbox_message` W + 핸들러 대상 | FR-031,033 | S3-4 |
| EV-05 | 임대 회수(reaper) | worker 주기 | `LeaseReaper` | outbox·inbox W | FR-033 / AC-015 | S3-3 |
| EV-06 | 재시도·백오프·dead 전이 | EV-02,04 실패 경로 | `RetryPolicy`, `ErrorClassifier` | outbox·inbox W | FR-032 | S3-4 |
| EV-07 | dead 재투입 | worker CLI `dead-requeue` | `DeadRequeueCommand` | outbox·inbox W | ADR-023 | S6-7 · 감사: `system.dead_requeued` |
| EV-08 | 흐름 단계 기록 | EV-01,02,03,04 훅 | `TraceRecorder` | `trace_step` W | FR-040 | S3-7 |
| EV-09 | 흐름 집계 | worker 주기 | `FlowAggregator` | `trace_step` R, `flow_counter` W | FR-041 | S4-7 |
| EV-10 | 보관 정리 | worker 주기 | `RetentionRunner`, 테이블별 `RetentionRule` | 전 테이블 D | FR-080 / AC-011 | S6-6 · 감사: `system.retention_ran` |
| EV-11 | 흐름 상세 조회 | `GET /api/flow/trace/{id}` | `GetTrace` | `trace_step` R | FR-040 | S4-6 |
| EV-12 | 흐름 요약 조회 | `GET /api/flow/summary` | `GetFlowSummary` | `flow_counter` R | FR-041 | S4-7 |
| EV-13 | 깨우기 신호(NOTIFY 발행/수신) | outbox·change_log·trace 변경 | `NotifyEmitter`, `NotifyListener` | — (Postgres NOTIFY) | FR-030 | S3-3 |
| EV-14 | 감사 기록 | 명령·관리 usecase 내부 / CLI | `AuditWriter`, `PostgresAuditWriter` | `audit_log` W(호출자의 같은 tx) | ADR-027 | S1-14 |
| EV-15 | 감사 조회 | `GET /api/admin/audit`, `worker audit:list` | `ListAuditLog`, `AuditCursorCodec` | `audit_log` R | ADR-027 | S6-9 |

## 5. realtime (RT)

| ID | 기능 | 트리거 | 클래스 | 접근 테이블 | 요구 | 작업 |
|---|---|---|---|---|---|---|
| RT-01 | 브로드캐스터(inbox 소비 → change_log) | inbox `entry.*`·`reaction.changed` | `RealtimeBroadcaster`, `PublicMessageMapper` | `change_log` W | FR-050 | S4-1 |
| RT-02 | change_log 순번 부여·정리(정리는 realtime 이 등록하는 `RetentionRule`) | RT-01, 주기 | `ChangeLogWriter`, `ChangeLogRetentionRule` | `change_log` W/D | ADR-023 | S4-1 (순번), S4-3 (정리) |
| RT-03 | public 소켓(업그레이드·hello·welcome·live) | `/ws/public` | `PublicSocketHandler` | — | FR-050 | S4-2 |
| RT-04 | 재개(replay/snapshot 판단) | RT-03 hello | `ResumeService` | `change_log` R | FR-051 / AC-008 | S4-3 |
| RT-05 | 스냅샷 구성 | RT-04 | `SnapshotBuilder` | `entry_view`·`flow_counter` R | FR-051 | S4-3 |
| RT-06 | 팬아웃·송신 큐·합치기·4408 | 변경 신호 | `PublicHub`, `SendQueue` | — | FR-051 / ADR-022 | S4-4 |
| RT-07 | private 소켓 | `/ws/private` | `PrivateSocketHandler`, `SessionVerifier` | `session` R | FR-040 | S4-6 |
| RT-08 | private 라우팅(`flow.step`) | `trace_step` 신호 | `PrivateRouter`, `TraceWatcher` | `trace_step` R | FR-040 | S4-6 |
| RT-09 | 접속자 수 | 연결/해제 | `PresenceCounter`(포트) | — | FR-050 | S4-2 |
| RT-10 | 하트비트·유휴 종료 | 타이머 | `HeartbeatScheduler` | — | FR-051 | S4-2 |
| RT-11 | 우아한 종료(bye) | SIGTERM | `GracefulShutdown` | — | ADR-014 | S4-4 |
| RT-12 | 깨우기 신호 수신(LISTEN+폴링) | NOTIFY/타이머 | `WakeSignal` | — | FR-030 | S4-1 |
| RT-13 | 세션 검증 캐시 | RT-07 | `SessionCache`(`KeyValueCache`) | — | FR-010 | S4-6 |
| RT-14 | 흐름 요약 주기 푸시 | 타이머 | `FlowSummaryPublisher` | `flow_counter` R | FR-041 | S4-7 |
| RT-15 | 연결 수 제한 | 업그레이드 | `ConnectionLimiter` | — | ADR-022 | S4-2 |
| RT-16 | 공개 변환(식별자 제거) | RT-01 | `PublicMessageMapper` | — | FR-041 / AC-009 | S4-5 |

## 6. web (WB)

| ID | 기능 | 경로/컴포넌트 | 요구 | 작업 |
|---|---|---|---|---|
| WB-01 | 앱 셸·레이아웃·로케일 라우팅 | `app/[locale]/layout` | FR-004 | S5-1 |
| WB-02 | 홈 | `/` | FR-001 | S5-2 |
| WB-03 | 자기소개 | `/about` | FR-001 | S5-2 |
| WB-04 | 아키텍처 설명 | `/architecture` | FR-002 | S5-2 |
| WB-05 | 방명록 목록 | `/guestbook` `EntryList` | FR-020 | S5-3 |
| WB-06 | 글 작성 폼 | `ComposeForm` | FR-020 | S5-3 |
| WB-07 | 반응 막대 | `ReactionBar` | FR-021 | S6-1 |
| WB-08 | 본인 글 수정·삭제 | `EntryActions` | FR-022 | S6-2 |
| WB-09 | 신고 다이얼로그 | `ReportDialog` | FR-023 | S6-3 |
| WB-10 | 내 흐름 시각화 (화면의 "보내기" = **방명록에 실제 글을 작성**, `POST /api/entries` — 데모 전용 이벤트 없음, 사용자 결정) | `FlowTimeline` | FR-040 | S5-5 |
| WB-11 | 전체 익명 요약 | `FlowSummaryPanel` | FR-041 | S5-5 |
| WB-12 | 연결 상태 배너 | `ConnectionBanner` | FR-051 | S5-4 |
| WB-13 | 운영 지표 페이지 | `/metrics` Grafana 임베드 | FR-061 | S7-4 |
| WB-14 | 관리자 신고 큐 | `/admin/reports` | FR-023 | S6-3 |
| WB-15 | 로그인·로그아웃·프로필 UI | `AuthMenu` | FR-011 | S5-3 |
| WB-16 | 개인정보·쿠키 안내 | `/privacy` | FR-080 | S5-2 |
| WB-17 | 오류·오프라인·폴백 UX | `ErrorBoundary`, `OfflineNotice` | FR-070 | S8-2 |
| WB-18 | 테마·언어 토글 | `Preferences` | FR-004 | S5-1 |
| WB-19 | API 클라이언트·쿼리 훅·낙관적 갱신 | `ApiClient`, `useEntries`… | FR-020 | S5-3 |
| WB-20 | WS 클라이언트·StoreBridge | `ConnectionManager` | FR-050 | S5-4 |
| WB-21 | 저장소 링크·CI 배지 | `RepoBadge` | FR-003 | S5-2 |

## 7. 공통 (CM)

| ID | 기능 | 위치 | 비고 | 작업 |
|---|---|---|---|---|
| CM-01 | 가드 체인(Session·Origin·RateLimit·Schema·Authorization) | `apps/api` | design/03 §8 | S2-5 |
| CM-02 | 멱등 키 처리 | `packages/kernel`+모듈 어댑터 | design/03 §3 | S3-2 |
| CM-03 | 오류→HTTP 매핑 | `apps/api/error-to-response` | design/00 §4.3 | S1-2 |
| CM-04 | 설정 로더 | `packages/config` | design/01 §7 | S1-3 |
| CM-05 | DB 풀·UoW·마이그레이션 실행 | `packages/db` | | S1-4 |
| CM-06 | 조립(compose) 루트와 생명주기(기동·종료) | `apps/*/compose` | api·worker·ws-gateway·web 각각 | S1-7 |
| CM-07 | 보조 포트 구현(RateLimiter·PresenceCounter·KeyValueCache·EventTransport) | `packages/infra` | ADR-024 | S1-8 |
| CM-08 | 시드·관리 CLI (`db:seed`, `worker rebuild\|dead-requeue\|rotate-field-keys\|admin write-lock\|audit:list\|retention:run` (모든 관리 CLI 는 `AuditWriter` 로 `system.*` 감사 기록)) | `scripts/`, `apps/worker/cli` | design/02, F16 §11 | S1-7 (프레임·시드), S6-5/S6-6/S6-4 (각 명령) |
| CM-09 | 프로토콜 스키마·JSON Schema 내보내기 | `packages/protocol` | design/01 | S1-9 |
| CM-10 | 시험 지원(testkit) | `packages/testkit` | design/08 | S1-10 |
| CM-12 | 컬럼 보호 등급 검사 | `modules/*/adapter/postgres/classification.ts` + `check:classification` | ADR-026, database-schema §9.1 | S1-13 |
| CM-11 | 시계·식별자 주입 | `kernel` 포트 | | S1-2 |

## 8. 운영 (OB)

| ID | 기능 | 위치 | 요구 | 작업 |
|---|---|---|---|---|
| OB-01 | 지표 레지스트리·HTTP 지표 미들웨어 | `modules/observability` | FR-060 | S7-1 |
| OB-02 | 도메인 지표(outbox 적체, 처리 지연, WS 연결, 큐 길이, dead 수) | 각 앱 | FR-060 | S7-1 |
| OB-03 | `/healthz` · `/readyz` (worker 는 `/healthz` 만) | 각 앱 | ADR-014 | S1-11 |
| OB-04 | 구조화 로그·trace_id 전파·마스킹 | `observability` | ADR-008 | S1-11 |
| OB-05 | Prometheus 수집 설정·규칙 | `infra/prometheus` | FR-060 | S7-2 |
| OB-06 | Grafana 프로비저닝·대시보드·Public dashboards | `infra/grafana` | FR-061 | S7-2,3 |
| OB-07 | nginx 프록시(라우팅·limit_req·realip·헤더·WS) | `infra/nginx` | AC-007,014 | S8-1 |
| OB-08 | 정적 폴백 1단계 (`build:fallback`) | `infra/nginx` | FR-070 / AC-010 | S8-2 |
| OB-09 | Cloudflare 정적 미러 2단계 | Cloudflare | FR-070 | S8-3 |
| OB-10 | 백업·복구 | `infra/scripts/backup.sh` | ADR-023 | S8-4 |
| OB-11 | pull 배포 | `infra/scripts/pull-deploy.sh` | ADR-014 | S8-6 |
| OB-12 | CI 워크플로(PR 검사·빌드·릴리스) | `.github/workflows` | — | S1-6,S8-6 |
| OB-13 | 쓰기 잠금·긴급 스위치 운영 절차 (`worker admin write-lock` + `POST /api/admin/write-lock`) | 런북 | ADR-008 | S6-4 (도구), S8-1 (런북) |
| OB-14 | k3d 매니페스트·롤링 검증 | `infra/k8s` | ADR-002 (AC-014 는 집 PC·Oracle) | S8-5 |
| OB-15 | 로그 아카이브·조회 | **systemd 타이머**(`pf-archive-logs`, 일 1회 03:10) / 운영자 | `archive-logs.sh`, `logq.sh`, `infra/systemd/*` | — (Docker 로그 → `$PF_LOG_DIR/archive`), 상태는 `status/archive_logs/last_run.json` | ADR-027 | S8-7 |
| OB-16 | 운영 상태 파일 수집 | worker `/metrics` 스크레이프 | `StatusFileCollector`, `StatusFileReader` (`status/<job>/last_run.json` → `pf_ops_*` 지표) | `STATUS_DIR` 파일(읽기 전용) | ADR-027 | S7-5 |
| OB-17 | 경보 라우팅(Discord) | Grafana 알림 평가 | Grafana 알림 규칙·연락처·정책 프로비저닝 (`infra/grafana/provisioning/alerting/**`, 식 정본 `infra/prometheus/rules/pf.yml`) | — | ADR-027 | S7-6 |

## 9. 합계

| 영역 | 기능 수 |
|---|---|
| ID | 10 |
| GB | 12 + 8 = 20 |
| EV | 15 |
| RT | 16 |
| WB | 21 |
| CM | 12 |
| OB | 17 |
| **합** | **111** |

## 9.1 공개 usecase / 공개 포트 등록 (모듈 경계용)

모듈이 다른 모듈에 내놓는 읽기·조회 진입점이다. 모듈 의존 표(architecture §4)와 같은 목록이어야 하며, 목록에 없는 직접 참조는 경계 규칙(B4)으로 CI 가 막는다.

| 소유 모듈 | 공개 이름 | 호출하는 쪽 | 용도 |
|---|---|---|---|
| guestbook | `ReadPublicEntries` | realtime(SnapshotBuilder) | 스냅샷의 공개 글 목록 (`PublicEntryView` 조회, GB-20 과 별개) |
| guestbook | `GetWriteLockState` (GB-11) | api 조립부(`/api/me`), 가드 | 쓰기 잠금 여부. identity 가 guestbook 테이블을 읽지 않도록 라우트 조립부가 합친다 |
| guestbook | `AnonymizeSessionData` (GB-12) | worker(`PurgeExpiredSessions`) | 세션 만료 익명화 |
| events | `TraceReader` | realtime(TraceWatcher) | `trace_step` 증분 읽기 (private 채널 `flow.step`) |
| events | `FlowSummaryReader` | realtime(SnapshotBuilder, FlowSummaryPublisher) | 익명 요약 읽기 |
| identity | `ResolveSession` | api 가드, ws-gateway(private) | 세션 해석 |
| events | `AuditWriter`(`record(tx, entry)`) | 모든 명령·관리 usecase, worker CLI | 행위와 같은 트랜잭션의 감사 기록 (EV-14) |
| events | `ListAuditLog` | api(`GET /api/admin/audit`), worker CLI | 감사 조회 (EV-15, 관리자 전용) |
| identity | `ListExpiredSessionIds`, `DeleteSessions` | worker(`PurgeExpiredSessions`) | 만료 세션 정리 |

## 9.2 백로그 (M1 이후, 위 합계에 포함하지 않음)

| ID | 기능 | 사유 |
|---|---|---|
| WB-22 | 관리자 감사 로그 화면(`/admin/audit`) | 관리자가 한 명이라 API(`GET /api/admin/audit`)와 CLI(`worker audit:list`)로 충분하다. M1 밖(2026-11-04 결정) |

## 10. 스키마 반영 항목 (상세 설계 F10~F17 이 요구, [database-schema.md](../../domains/database-schema.md) 에 반영됨)

| 추가·변경 | 사유 |
|---|---|
| `guestbook.write_lock` (단일 행: `id=1`, `locked`, `reason`, `changed_by`, `changed_at`, `version`) | GB-10/11 |
| `guestbook.entry`: `status` 에 `deleted`, `deleted_at`, 본문 길이 CHECK 조정 / `report`: `reason_code`, `note`, `resolution`, `resolved_by` | GB-03, GB-06, GB-09 |
| `entry_view`: 필드별 순번 `content_seq`·`status_seq`·`reaction_seq`(jsonb), `version`, `author_kind`, `author_actor_key`(← `author_user_id` 대체), `status` 에 `deleted` | GB-23, GB-20 |
| `my_reaction`: `present`(묘비) + `last_seq` | GB-24 |
| `projection_state(name, status, fence_seq, snapshot_loaded, updated_at)`, `entry_view_next`(재구성 중 임시) | GB-26 |
| 모든 `inbox_message`: `aggregate_id` + `(consumer, aggregate_id, seq)` 부분 인덱스 / `outbox_event (aggregate_id, seq)` 인덱스 / `next_attempt_at` 기본값 `now()` | EV-02, EV-04 (집합체별 선두 규칙) |
| `events.trace_step`: `id bigint identity` + `(trace_id, id)` 인덱스 | EV-11, RT-08 |
| `realtime_read.channel_seq`(채널당 1행 카운터), `change_log.event_id`(유일) | RT-01, RT-02 |
| 보관 정리의 읽기 모델 직접 쓰기 예외(`entry_view.author_actor_key` NULL, `my_reaction` 삭제), `LoadEntryForConflict` 의 쓰기 스키마 조회 예외 | ID-10, GB-12, GB-22 |
