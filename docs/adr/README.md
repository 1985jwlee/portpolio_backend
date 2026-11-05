# ADR (Architecture Decision Records)

이 프로젝트의 결정 기록. **결정당 파일 1개**, 번호는 재사용하지 않는다. 뒤집히면 지우지 않고 `Superseded by ADR-xxx` 로 표시한다.
입력은 두 가지였다: 초기 로드맵(원 계획안)과 인터뷰로 만든 첫 마일스톤 명세(`specs/portfolio-site.spec.md`). 원 계획안은 요지를 README 로드맵과 이 ADR 들에 흡수한 뒤 폐기했다.

구조 문서: [아키텍처](../domains/architecture.md) · [데이터베이스 구조](../domains/database-schema.md)

## 인덱스 (최신이 위로)

| 날짜 | ID | 요지 | 상태 |
|---|---|---|---|
| 2026-11-04 | [ADR-048](ADR-048-mock-currency-and-mixed-payment.md) | 모의 통화(USDC·POINT): 첫 로그인 지급, 단방향 교환, 혼합 결제, 선택적 지갑 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-047](ADR-047-chat-data-protection-retention.md) | 채팅 데이터 보호·보관: 방 종류별 등급, CS 본문 암호화 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-046](ADR-046-cs-ticket-and-agent-assignment.md) | CS 티켓과 상담원 배정: 상태 머신, CAS+임대 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-045](ADR-045-chat-message-delivery.md) | 채팅 메시지 전달: REST 쓰기, 방별 순번, 멱등, 재개 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-044](ADR-044-carrier-adapter-and-tracking.md) | 배송사 어댑터와 추적 모델 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-043](ADR-043-outbound-saga-and-compensation.md) | 주문→출고 사가: 하이브리드 조정과 보상 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-042](ADR-042-dual-ledger-and-allocation.md) | 이중 원장(판매 재고/물리 재고)과 2단계 할당 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-041](ADR-041-price-feed-and-quote.md) | 시세 피드와 견적: 소스 교차 검증, fail-closed | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-040](ADR-040-escrow-settlement-and-ledger.md) | 에스크로·정산 상태 머신과 복식 원장 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-039](ADR-039-payment-adapter-and-webhook-idempotency.md) | 결제 어댑터와 웹훅 멱등: 포트, 상태 머신, 승인은 트랜잭션 밖 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-038](ADR-038-stock-reservation-and-redis-role.md) | 재고 선점과 Redis 역할: 두 게이트(Redis 빠른 게이트 + DB CHECK 하드 게이트) | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-037](ADR-037-simulated-points-ledger.md) | 모의 포인트 원장: 복식·추가 전용, 보상 PENDING→확정/박탈 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-036](ADR-036-katago-analysis-worker.md) | KataGo 분석 워커: 별도 프로세스, 2단계 분석, 선점·임대 큐 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-035](ADR-035-game-state-and-realtime-protocol.md) | 대국 상태 머신·서버 권위·재접속: 이벤트 로그가 진실, 명령은 REST, push 는 NOTIFY | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-034](ADR-034-baduk-rules-engine.md) | 바둑 룰 엔진: 공유 TS 패키지 직접 구현, 라이브러리는 차분 시험 기준 (ADR-012 선정 절차 수행) | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-033](ADR-033-resource-budget-and-deploy-units.md) | 자원 예산과 배포 단위: 상시 60% 이하, CPU 예산 분리 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-032](ADR-032-room-channel-model.md) | 룸 실시간 채널: /ws/room 세 번째 연결, push 전용 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-031](ADR-031-event-transport-streams.md) | 이벤트 전달 계층: Postgres 정본, Redis Streams 는 Phase 3 에서 판정 (ADR-006 대체) | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-030](ADR-030-service-boundary-criteria.md) | 서비스 경계 기준: 모놀리스 유지, 5축 판정, KataGo 만 분리 | Accepted (2026-11-05) |
| 2026-11-04 | [ADR-029](ADR-029-license-and-content-rights.md) | 라이선스: 코드·설계 문서는 MIT, 개인 콘텐츠는 저작권 유보(CONTENT-LICENSE) | Accepted |
| 2026-11-04 | [ADR-028](ADR-028-incident-response.md) | 보안사고 대응: 심각도 S1~S3, 증거 보존 우선, 비상 스위치 사다리, 자산별 런북, 비밀 스캔·회전 리허설 | Accepted |
| 2026-11-04 | [ADR-027](ADR-027-server-logs.md) | 서버 기록: 로그 4종(앱·접근·감사·운영 상태), 파일 회전 7일 보관, Postgres 감사 테이블(행위와 같은 tx) | Accepted |
| 2026-11-04 | [ADR-026](ADR-026-data-protection.md) | 데이터 보호: 5등급 분류, 전송·해시·서명·백업(age)·시크릿, 필드 암호화는 report.note 만(AES-256-GCM, 키 ID·회전) | Accepted |
| 2026-11-04 | [ADR-025](ADR-025-query-layer.md) | 쿼리 계층: Drizzle 빌더 기본, 같은 tx 의 sql 템플릿(T1), 트랜잭션 밖 별도 연결(T2), raw 레지스트리 | Accepted |
| 2026-11-04 | [ADR-024](ADR-024-redis-seam.md) | Redis: M1 제외, 포트 뒤 도입 이음새, 도입 기준·장애 거동 | Accepted |
| 2026-11-04 | [ADR-023](ADR-023-operational-policies.md) | 운영 정책 선제 확정: 임대·백오프, 길이 상한, IP 미저장, 보관, 그림자 재구성, 2단계 폴백(2026-11-05 수동 전환 대체 페이지로 갱신), 알림, 백업 | Accepted |
| 2026-11-04 | [ADR-022](ADR-022-tech-stack-definition.md) | 전체 기술 스택 확정, 추천에서 바뀐 곳(web=Bun, nginx), 구현 초기 관문 G1~G10(G1 은 Funnel 교체로 폐기, 대체 G14) | Accepted |
| 2026-11-03 | [ADR-021](ADR-021-concurrency-control.md) | 동시성: 처리 전 `processing` 선점(CAS) + 임대 + 토큰 + 낙관적 버전 | Accepted |
| 2026-11-03 | [ADR-020](ADR-020-inbox.md) | Inbox: 수신 메시지를 먼저 저장하고 선점해서 한 번만 처리 | Accepted |
| 2026-11-03 | [ADR-019](ADR-019-layered-architecture.md) | 모듈 내부 구조: domain · service · usecase (usecase → service → domain) | Accepted |
| 2026-11-03 | [ADR-018](ADR-018-cqrs.md) | CQRS: 명령/조회 모델 분리, 읽기 모델은 프로젝션 테이블 | Accepted |
| 2026-11-03 | [ADR-017](ADR-017-database-conventions.md) | DB 규약: 모듈별 쓰기/읽기 스키마, 스키마 간 FK 없음, inbox·선점 컬럼·version | Accepted |
| 2026-11-03 | [ADR-016](ADR-016-payments-and-extensions.md) | 결제·정산(모의)과 Phase 6 확장은 순서대로, 독립 DoD 로 | Accepted (부분 대체: 결제·에스크로·시세·원장·6a·6c 는 ADR-039~041·032·042~047) |
| 2026-11-03 | [ADR-015](ADR-015-positioning-and-scope-rules.md) | 타깃 서사, 모의 면책, 외부 참고 금지·비공개 범위 | Accepted |
| 2026-11-03 | [ADR-014](ADR-014-deployment-and-zero-downtime.md) | CD, probe, 롤링 배포 중 소켓 재접속·세션 복구, 에셋 캐시 | Accepted |
| 2026-11-03 | [ADR-013](ADR-013-milestone-scope-and-numbers.md) | M1 을 전부 한 번에 내되, 성능 수치는 측정 후에만 쓴다 | Accepted |
| 2026-11-03 | [ADR-012](ADR-012-go-rule-library.md) | 바둑 룰은 라이브러리로 쓰고 선정은 Phase 1 에서 한다 | Accepted (부분 대체: 라이브러리 사용 결정은 ADR-034, 어댑터·시험 세트는 유효) |
| 2026-11-03 | [ADR-011](ADR-011-settlement-currency-usdc.md) | 정산 통화는 USDC, 시세는 스냅샷 + 견적 유효시간 | Accepted |
| 2026-11-03 | [ADR-010](ADR-010-stock-consistency.md) | 재고는 Lua 원자 선점 + 예약 TTL + outbox + 멱등 소비 | Accepted |
| 2026-11-03 | [ADR-009](ADR-009-game-verdict-and-anticheat.md) | 승패는 룰 엔진 즉시 판정, KataGo 는 비동기 사후 분석 | Accepted |
| 2026-11-03 | [ADR-008](ADR-008-visitor-identity-and-abuse.md) | 익명 세션 + GitHub 로그인, 사후 신고·숨김, 7일 보관 | Accepted |
| 2026-11-03 | [ADR-007](ADR-007-observability.md) | 관측은 Prometheus + Grafana 읽기 전용 임베드 | Accepted |
| 2026-11-03 | [ADR-006](ADR-006-event-delivery-layer.md) | 이벤트 전달 계층: Postgres 폴링에서 Redis Streams 또는 Kafka 로 | Superseded by ADR-031 |
| 2026-11-03 | [ADR-005](ADR-005-outbox-idempotent-consumer.md) | Outbox: 쓰기와 이벤트는 한 트랜잭션, 수신 쪽은 inbox(개정) | Accepted |
| 2026-11-03 | [ADR-004](ADR-004-tech-stack.md) | Bun+Elysia / Next.js+R3F / WebSocket 단일 / 공유 타입 | Accepted |
| 2026-11-03 | [ADR-003](ADR-003-free-hosting.md) | 완전 무료 호스팅, 집 PC 단일 호스트(Oracle 미추진), Tailscale Funnel 노출(도메인 미구입, 2026-11-05 갱신), 정적 폴백·수동 전환 대체 페이지 | Accepted |
| 2026-11-03 | [ADR-002](ADR-002-runtime-compose-live-k3d-verified.md) | 라이브는 Compose, K8s 는 로컬 k3d 검증본, Gateway API | Accepted |
| 2026-11-03 | [ADR-001](ADR-001-modular-monolith.md) | 모듈러 모놀리스 + 다중 엔트리포인트 | Accepted |

## 원 계획안의 모순점 13건 → 어디서 닫았나

| # | 원 계획안의 문제 | 확정 수정안 | ADR |
|---|---|---|---|
| 1 | 결제는 SOL, 에스크로는 USDC 로 통화 불일치 | USDC 로 통일, 환산 KRW-USDC | 011 |
| 2 | "실시간 환율"과 "1시간 스냅샷" 모순 | 스냅샷 + 견적 유효시간, 결제 시점 환율 기록, 주기 5~10분 | 011 |
| 3 | "오라클"이라는 명칭 오용 | Price Feed(시세 피드) | 011 |
| 4 | KataGo 가 승패를 승인 | 승패는 룰 엔진 즉시, KataGo 는 비동기 사후 분석, 보상 상태 관리 | 009 |
| 5 | 모놀리스인데 파드가 나뉘는 이유 불명 | 단일 코드베이스 + 다중 엔트리포인트 | 001 |
| 6 | 유저 0명에 K8s·Kafka 는 과함 | 선택 근거·트레이드오프·"실서비스라면"을 ADR 에 기록 | 001·002·006 |
| 7 | ingress-nginx 는 2026-03 retire | Gateway API(HTTPRoute) | 002 |
| 8 | "TCP/IP 및 WebSocket" 혼재 | WebSocket 단일 프로토콜 | 004 |
| 9 | 근거 없는 "10,000+ TPS" | "목표 TPS" 표기, k6 측정 후 기재 | 013 |
| 10 | Zero-Downtime 주장에 관측·CD·probe·PDB·재접속 설계 없음 | 해당 항목을 Phase 4 에 포함 | 007·014 |
| 11 | DECRBY → Kafka → PG 의 정합성 공백 | Lua 선점 + 예약 TTL + outbox + 멱등 소비 | 005·010 |
| 12 | 타깃 포지션 3개로 서사 분산 | 백엔드 중심 풀스택 엔지니어 | 015 |
| 13 | Unity WebGL 임베딩은 과함 | three.js(R3F), 공유 타입 패키지 | 004 |

## 템플릿

```markdown
# ADR-NNN: 제목
- 상태: Proposed | Accepted | Superseded by ADR-xxx
- 날짜: YYYY-MM-DD
- 근거: 명세 FR/AC · 인터뷰 라운드 · 로드맵 Phase · 조사 결과

## 맥락
## 결정
## 설계 상세
## 대안과 기각 이유
## 결과 (얻는 것 / 치르는 것)
## 위험과 완화
## 검증 방법
## 실서비스라면
## 재검토 조건
## 관련 ADR
```
