# portpolio_backend

**"이런 시스템을 혼자 설계·구현·배포할 수 있다"를, 직접 눌러볼 수 있는 라이브 사이트와 기록된 결정으로 증명하는 포트폴리오.**

> 현재 상태: **설계 단계.** 구현 코드는 아직 없고, 결정은 [`docs/adr/`](docs/adr/README.md), 첫 마일스톤의 요구는 [`specs/portfolio-site.spec.md`](specs/portfolio-site.spec.md) 에 있다.
> 면책: 이 프로젝트의 **결제·정산·포인트는 모의(시뮬레이션) / 테스트넷**이며 실제 금전 거래는 없다.

## 목적

- 백엔드 중심 풀스택 엔지니어로서 **실시간 통신, 이벤트 기반 정합성, 인프라·관측**까지 혼자 끝까지 만들 수 있음을 보인다.
- 대상 독자는 **다양한 스타트업의 채용 담당자·방문자**다. 이력서 서사는 "게임 9년 + 실시간/결제/인프라까지 혼자 설계·구현·배포"이다.
- **사이트 자체가 백엔드 작품**이다. 소개 문서가 아니라 방문자가 직접 써보는 라이브 데모가 증거가 된다.

## 목표

1. **직접 눌러볼 수 있는 라이브 URL**을 **0원(카드 불필요)** 으로 상시 공개한다. → [ADR-003](docs/adr/ADR-003-free-hosting.md)
2. 결정을 말이 아니라 **기록**으로 남긴다. 선택 근거, 기각한 대안, "실서비스라면 이렇게 줄인다"까지 ADR 에 쓴다.
3. 수치는 **측정 후에만** 쓴다. 근거 없는 TPS·지연 숫자를 README 에 적지 않는다. → [ADR-013](docs/adr/ADR-013-milestone-scope-and-numbers.md)
4. 각 단계는 **단독으로 포트폴리오에 쓸 수 있는 완료 기준(DoD)** 을 가진다. 중간에 멈춰도 결과물이 남는다.

## 증명하려는 역량

| 역량 | 보여주는 방식 | 근거 |
|---|---|---|
| 이벤트 기반 정합성 | outbox + inbox, 멱등 소비, 재시도·dead-letter 를 실시간으로 시각화 | [ADR-005](docs/adr/ADR-005-outbox-idempotent-consumer.md), [ADR-020](docs/adr/ADR-020-inbox.md) |
| 아키텍처 | CQRS, domain · service · usecase 계층, 모듈러 모놀리스 | [ADR-018](docs/adr/ADR-018-cqrs.md), [ADR-019](docs/adr/ADR-019-layered-architecture.md) |
| 동시성 제어 | 처리 전 상태 선점(CAS) + 임대 + 낙관적 버전 | [ADR-021](docs/adr/ADR-021-concurrency-control.md) |
| 실시간 통신 | WebSocket, 재접속·세션 복구, 서버 권위 상태 | [ADR-004](docs/adr/ADR-004-tech-stack.md), [ADR-014](docs/adr/ADR-014-deployment-and-zero-downtime.md) |
| 관측성 | Prometheus + Grafana 를 공개 임베드 | [ADR-007](docs/adr/ADR-007-observability.md) |
| 인증·악용 방어 | 익명 세션 + GitHub 로그인, 속도 제한, 사후 신고·숨김 | [ADR-008](docs/adr/ADR-008-visitor-identity-and-abuse.md) |
| 인프라 판단 | 무료 호스팅 조사, Compose 라이브 + K8s(k3d) 검증 | [ADR-002](docs/adr/ADR-002-runtime-compose-live-k3d-verified.md) |

## 기술 스택

Bun + ElysiaJS (TypeScript) · PostgreSQL 18 + Drizzle · Next.js (App Router) + three.js (React Three Fiber) · WebSocket · nginx · Prometheus + Grafana · Docker Compose (라이브) / k3d + Gateway API (검증). 버전·도구 전체는 [tech-stack.md](docs/domains/tech-stack.md), 이유는 [ADR-022](docs/adr/ADR-022-tech-stack-definition.md).

## 로드맵

각 Phase 는 독립 DoD 를 가진다. **Phase 4 완료 시점부터 이력서 제출 가능**, 이후 Phase 는 병행·중단 가능.

| 단계 | 내용 | DoD | 결정 |
|---|---|---|---|
| Phase 0 | 모노레포, 모듈 경계, ADR 템플릿, CI, 로컬 k3d + Gateway API 최소 배포 | `git push` → CI 통과 → 로컬 K8s 에 hello 서비스 배포 | ADR-001·002 |
| **M1** (Phase 0~1 사이) | 사이트 셸 + 방명록·이모지 + 이벤트 시각화 + WebSocket + 지표 대시보드 + 정적 폴백 | 명세의 인수 기준 AC-001~014 통과, 라이브 URL | [명세](specs/portfolio-site.spec.md), ADR-003~008·013 |
| Phase 1 | 바둑 실시간 코어. 1-A 서버·프로토콜(룰 라이브러리, 룸·대국·관전, 재접속, 채팅, SGF) → 1-B three.js 3D 클라이언트 | 두 브라우저에서 3D 대국 완료, 새로고침·끊김 후 복구, 관전자 동기화, 데모 영상 | ADR-004·012·014 |
| Phase 2 | KataGo 워커 + 모의 포인트 원장 (보상 `PENDING → CONFIRMED/FLAGGED`) | 대국 종료 → 비동기 분석 → 보상 확정 end-to-end, 실패·재시도 확인 | ADR-006·009 |
| Phase 3 | 타임딜: Redis Lua 재고 선점 → outbox → 멱등 소비 → Postgres, k6 부하 시험 | 초과 판매 0건 + 부하 결과표 | ADR-010·013 |
| Phase 4 🎯 | 프로덕션화: 워크로드 분리, HPA·probe·PDB, 롤링 배포 시 소켓 재접속, 관측, CD, 에셋 캐시, 패키징 | README + 영상만으로 "무엇을·왜·얼마나 잘" 이해 가능 | ADR-002·007·014 |
| Phase 5 | 결제·정산(모의): PG 테스트 모드, 에스크로 흐름, 시세 피드 | 결제 → 에스크로 → 정산 재현, 환율 고정 시점 기록 | ADR-011·016 |
| Phase 6 | 확장(순서대로, 중단 가능): CS 채팅 → Passkey → WMS → Solana USDC 에스크로(devnet) → 마작 | 항목별 독립 DoD | ADR-016 |

## 저장소 안내

| 경로 | 내용 |
|---|---|
| `docs/adr/` | 결정 기록 (인덱스: `docs/adr/README.md`) |
| `specs/portfolio-site.spec.md` | M1 요구사항(EARS)·인수 기준·가정·결정 로그 |
| `docs/design/` | 구현 수준 설계 (출발점: [00 전체 시스템·공통 규약](docs/design/00-system-overview.md)). 저장소 골격 [01](docs/design/01-repository-structure.md) · 개발 환경 [02](docs/design/02-dev-environment.md) · API [03](docs/design/03-api-contract.md) · WebSocket [04](docs/design/04-ws-protocol.md) · 이벤트 [05](docs/design/05-event-catalog.md) · 인증 [06](docs/design/06-auth.md) · 프론트엔드 [07](docs/design/07-frontend.md) · 시험 [08](docs/design/08-test-strategy.md) · CI/CD [09](docs/design/09-ci-cd.md) · 보안 [10](docs/design/10-security.md) · 구현 계획 [11](docs/design/11-implementation-plan.md) · 콘텐츠 [12](docs/design/12-content.md) · 보안사고 대응 [13](docs/design/13-incident-response.md) · SEO·오류 화면 [14](docs/design/14-seo-and-error-pages.md) · 시각 디자인 [15](docs/design/15-visual-design.md) |
| `docs/design/features/` | 기능 단위 상세 설계: [기능 카탈로그](docs/design/features/00-feature-catalog.md)와 모듈별 F10~F17(클래스·시퀀스·순서도) |
| `docs/domains/` | 도메인 문서 정본: [기술 스택](docs/domains/tech-stack.md), [아키텍처](docs/domains/architecture.md), [데이터베이스 구조](docs/domains/database-schema.md) |
| `.claude/`(일부), `CLAUDE.md` | 개발용 에이전트 시스템의 진입점·설정·검증 데이터만 추적한다. 에이전트·스킬 등 엔진 본체와 `.codex/`, `.agents/` 는 추적하지 않으며(`.gitignore`) 클론 후 다른 프로젝트에서 흡수한다 |

## 라이선스

- **코드, 설정, 설계 문서, ADR**: [MIT](LICENSE)
- **개인 콘텐츠**(자기소개·경력 문구, 사진, 개인 글 등 `apps/web/content/**`): **모든 권리 유보** — 범위와 서드파티 목록은 [CONTENT-LICENSE.md](CONTENT-LICENSE.md), 결정 배경은 [ADR-029](docs/adr/ADR-029-license-and-content-rights.md)
