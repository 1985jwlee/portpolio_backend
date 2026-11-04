# 기술 스택

이 프로젝트가 **무엇으로 만들어지는지**의 정본. 왜 그렇게 정했는지는 [ADR-022](../adr/ADR-022-tech-stack-definition.md)와 각 ADR 에 있다.
버전은 **2026-11-04 조사 기준**이다. 구현을 시작할 때 다시 확인한다(§12).
이 문서의 "상태" 열은 셋이다.

| 상태 | 뜻 |
|---|---|
| **확정** | 사용자가 정했거나 근거가 충분해 더 확인하지 않는다 |
| **관문부** | 선택은 정했지만 **공식 근거가 부족해** 구현 초기 관문(§11)을 통과해야 확정된다. 실패 시 대안이 정해져 있다 |
| **스파이크** | 후보만 정했고 구현 초기 비교 시험으로 고른다 |

## 1. 선택 원칙

1. **하나의 언어(TypeScript)와 하나의 타입 체계**로 서버·클라이언트·스키마를 잇는다(ADR-004). 다른 언어는 필요가 증명될 때만 쓴다(§10).
2. **무료 자원의 풋프린트**: 집 PC 또는 Oracle Always Free(Arm 2 OCPU / 12GB)에서 상시 돌아야 한다. 컨테이너 수와 메모리가 선택의 기준이다.
3. **공식 근거가 있는 것을 기본으로, 근거가 부족한 것은 관문으로** 확인한다. 조사가 못 채운 곳을 취향으로 채우지 않는다.
4. 같은 이미지·같은 설정 계약으로 **집 PC / Oracle / k3d** 세 환경을 지원한다(ADR-002).

## 2. 런타임·언어

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 언어 | TypeScript (엄격 모드) | — | 확정 | `typescript-strict` 규약: `any`·`as` 남용 금지, 에러 처리 패턴 |
| 런타임 | **Bun** | 1.4.4 (로컬도 1.4.4로 맞춤, 2026-11-04) | 확정 | api·ws-gateway·worker·**web** 모두 Bun 으로 실행 |
| 패키지 관리·스크립트 | Bun (`bun.lock`) | — | 확정 | 저장소 도구도 TypeScript(Bun) |
| 컨테이너 베이스 | `oven/bun` (`1.4-alpine` 또는 `slim`) | 1.4 | 확정 | amd64·arm64 제공 |

> web(Next.js)을 Bun 으로 실행하는 것은 **Next 공식 보증이 없다**(Next 공식 요구는 Node ≥ 20.9). 사용자가 선택했고(ADR-022) 관문 G3 로 확인한다. 실패 시 web 만 Node 22 LTS 로 바꾼다.

## 3. 백엔드

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| HTTP·WebSocket 프레임워크 | **ElysiaJS** | 1.4.30 | 확정 | 의존: `@sinclair/typebox` ≥ 0.34 < 1 |
| 입력 검증 | TypeBox (Elysia 내장 방식) | — | 확정 | 메시지 스키마의 정본은 `packages/protocol` |
| WebSocket | Elysia 내장(Bun 기반) | — | **관문부 G2** | 백프레셔 `backpressureLimit` 기본 16MB, `idleTimeout` 기본 120초. 다수 연결 장시간 안정성은 근거 부족. 느린 소비자 차단은 설정 위치에 따라 동작이 갈려(Elysia 라우트 옵션 무시) 직접 시험·구현(ADR-022 측정) |
| 구조 | 모듈러 모놀리스, domain·service·usecase, CQRS, outbox/inbox | — | 확정 | ADR-001·018·019·020·021 |
| 인증 | **직접 구현**: GitHub OAuth(PKCE S256 + state), 세션은 우리 `identity.session`(토큰 해시 저장) | — | 확정 | Arctic 은 2026-07 deprecated, Better Auth 는 해시 저장 여부 불명 |
| 속도 제한 | nginx `limit_req`(접속 주소별) + 앱(세션별) | — | 확정 | 이중. 접속 주소 정규화는 G7 |
| 설정 | 환경 변수 단일 모듈(`packages/config`)에서 읽고 검증 | — | 확정 | 비밀값은 저장소에 두지 않음 |
| 로깅 | 구조화 JSON 로그 | — | 스파이크 G5 | 라이브러리는 메트릭과 함께 비교 |

## 4. 데이터

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| DB | **PostgreSQL** | 18.6 | 확정 | `uuidv7()` 내장. 공식 이미지 `18-alpine`(arm64 포함) |
| 구조 정본·마이그레이션 | **Drizzle** (스키마 + `drizzle-kit`) | drizzle-orm **0.45.x 고정**, drizzle-kit 0.31.x | 확정 | 1.0 은 아직 rc(마이그레이션 폴더 구조 변경). 안정화 후 업그레이드 |
| 마이그레이션 방식 | forward-only, 표현 불가 기능은 `generate --custom` raw SQL | — | 확정 | 부분 인덱스·확장 등 |
| DB 드라이버 | 후보: postgres.js / Bun.sql / node-postgres | — | **스파이크 G4** | 기준: Drizzle 호환, 트랜잭션, **LISTEN/NOTIFY 전용 연결**, `FOR UPDATE SKIP LOCKED`, 안정성 |
| 기본키 | uuid v7 | — | 확정 | 앱 생성(outbox 이벤트 id 를 트랜잭션 전에 알아야 함, ADR-017). DB 내장 `uuidv7()` 은 보조 |
| 캐시·스트림 | Redis 또는 Valkey | Redis 8.10 / Valkey 9.1 | **M1 에서 쓰지 않음**(포트 뒤 이음새만, ADR-024) | Phase 2·3 에서 ADR-006 측정 후 선택. 클라이언트 후보 ioredis 등은 그때 |

## 5. 프론트엔드

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 프레임워크 | **Next.js (App Router)** | 16.4.5 | 확정 | `output: 'standalone'`, 모노레포라 `outputFileTracingRoot` 설정 |
| UI 라이브러리 | React | 19.3.1 | 확정 | |
| 실행 | Bun | — | **관문부 G3** | 위 §2 경고 |
| 스타일 | **Tailwind CSS 4** + **shadcn/ui** | 4.3.4 / CLI 4.23 | 확정 | CSS 우선 설정(`@theme`) |
| 서버 상태 | **TanStack Query** | 5.105 | 확정 | 서버 컴포넌트에서 prefetch → dehydrate/hydrate. Server Action 을 `queryFn` 으로 쓰지 않음 |
| i18n | **next-intl** | 4.14 | 확정 | 경로 기반 ko/en, `[locale]` 하위, Next 16 의 `proxy.ts` |
| WebSocket 클라이언트 | 브라우저 내장 `WebSocket` + **직접 재접속**(지수 백오프 + 무작위 지연, 순번 복구) | — | 확정 | ADR-014. 내장은 자동 재접속이 없다 |
| 3D (Phase 1-B) | three.js / React Three Fiber | — | 후속 | 클라이언트 전용(SSR 제외) |
| 자체 호스팅 주의 | 다중 인스턴스 시 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`·`deploymentId`, 스트리밍은 프록시 버퍼링 끄기 | — | 확정 | 단일 인스턴스면 후자가 핵심 |

## 6. 진입·프록시·네트워크

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 리버스 프록시 | **nginx** | 구현 시 고정 | **관문부 G7** | 경로 라우팅·WebSocket·`limit_req`. `realip` 모듈이 소스 기본 빌드에 없어 **사용할 이미지에 포함됐는지 확인**. Oracle 경로 TLS 자동화 방식(ACME 모듈 vs 별도 발급 컨테이너) 미결 |
| 터널(집 PC) | Cloudflare Tunnel(`cloudflared`) | — | **관문부 G1** | WebSocket 통과, `CF-Connecting-IP` 부착 여부 미확인 |
| DNS | Cloudflare 무료 DNS | — | 가정 A-006 | |
| K8s 진입(검증본) | Gateway API **v1.7.0**, 구현체 **Envoy Gateway** v1.9.3 | — | **관문부 G8** | WebSocket(HTTPRoute) 동작과 k3d 에서의 노출은 실측 |

## 7. 인프라·배포

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 컨테이너 | Docker / Docker Compose | Docker 29.8 (로컬) | 확정 | 라이브는 Compose, 같은 이미지 |
| 로컬 K8s(검증) | **k3d** | 5.9.0 | 확정 | 로컬에 미설치 — 설치 필요 |
| 레지스트리 | GHCR | — | 확정 | |
| CI | GitHub Actions | — | 확정 | amd64·arm64 **네이티브 러너 각각 빌드 후 매니페스트 병합**. arm 러너는 공개 저장소에서 무료(비공개는 과금) → 저장소 공개 전제(A-003) |
| 배포 방식 | 호스트가 이미지를 가져가는 pull | — | 확정(세부 미결) | 가져오는 주기·트리거는 구현 시 |
| 호스팅 | 집 PC(+터널) 1차, Oracle Always Free 이전 대비 | — | 확정 | ADR-003 |

## 8. 관측·부하

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 지표 수집 | **Prometheus** | 3.15.1 | 확정 | |
| 대시보드 | **Grafana** | 13.3.0 | 확정 | |
| 공개 방식 | **Public dashboards 우선** | — | **관문부 G6** | iframe 임베드 허용 설정 키를 문서로 확인하지 못함 → 실측, 안 되면 익명 읽기 전용 뷰(`[auth.anonymous]` `org_role = Viewer`)로 후퇴 |
| 앱 지표 라이브러리 | 후보: prom-client / OpenTelemetry(`@elysiajs/opentelemetry` 1.4.11) | — | **스파이크 G5** | Bun 호환 공식 근거 없음 |
| 부하 시험 | **k6** | 2.3.0 | 확정 | Docker(`grafana/k6`)로 실행, Arm 이미지 지원은 미확인 |

## 9. 개발 도구·품질

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 모노레포 | **Bun 워크스페이스 단독** | — | 확정 | Turborepo 는 빌드가 느려질 때 추가 |
| 경계 검사 | **dependency-cruiser** | 18.7 | 확정 | 계층 규칙(`domain ↛ service` 등)과 CQRS 규칙(`usecase/query ↛ 쓰기 포트`)을 정규식 규칙으로 표현, `error` 면 CI 실패 |
| 린트·포맷 | **Biome** | 2.6 | 확정 | **계층 검사는 못 한다**(`noRestrictedImports` 는 임포트하는 쪽을 구분하지 못함) → 위 도구가 맡는다 |
| 단위·통합 시험 | **`bun test`** | Bun 내장 | 확정 | `mock.module` 지원. 가짜 타이머 지원 여부는 미확인 → 시계는 포트로 주입(ADR-019) |
| DB 통합 시험 | CI 의 compose 서비스(실제 Postgres) | — | 확정 | Testcontainers 는 Bun 호환 확인 후(**G9**, 선택) |
| E2E | Playwright 계열 | — | 후속 | 도구 선정은 E2E 시작 시 |
| 타입 검사 | `tsc --noEmit` | — | 확정 | CI 필수 |

## 10. M1 에서 쓰지 않는 것

이 엔진의 언어별 역할 표에는 Go·Rust·Python·C#·C++ 가 있지만, **M1 에는 필요가 증명되지 않아 쓰지 않는다.**

| 언어 | 쓸 수 있는 시점 | 조건 |
|---|---|---|
| Go | ws-gateway 대체 | 관문 G2 실패 시 |
| Python / C++ | KataGo 분석(Phase 2) | KataGo 는 외부 엔진이라 프로세스로 호출. 래퍼 언어는 그때 ADR 로 |
| Rust · C# | — | 이 프로젝트에 해당 영역 없음 |

## 11. 구현 초기 검증 관문

조사가 결론을 못 낸 곳이다. **통과해야 "관문부"가 "확정"이 된다.** M1 구현의 맨 앞(단계 0)에서 처리한다.

| ID | 대상 | 통과 기준 | 실패 시 |
|---|---|---|---|
| **G1** | Cloudflare Tunnel | ① WebSocket 이 터널을 통과한다 ② `CF-Connecting-IP` 가 붙어 nginx 에서 읽힌다 | ① 실패 → SSE 등 대체(ADR-003 후속) ② 실패 → 속도 제한 기준을 세션으로만 |
| **G2** | Bun WebSocket 장시간 | 목표 연결 수(측정 기준을 시험 전에 고정)에서 장시간 메모리가 증가하지 않고 재접속 복구가 정상, 느린 소비자가 메모리를 무한히 키우지 않음 | Go ws-gateway 로 교체(프로토콜을 언어 중립 스키마로 두어 교체 비용을 낮춘다) |
| **G3** | Next.js on Bun | 빌드·`standalone` 실행·SSR·ISR·정적 에셋·`next-intl`·이미지 최적화가 Bun 런타임에서 정상 | web 만 Node 22 LTS 로 실행 |
| **G4** | DB 드라이버 | Drizzle 호환 + 트랜잭션 + **LISTEN/NOTIFY 전용 연결** + `SKIP LOCKED` 동시성 시험 통과 | 후보 순서대로 대체 |
| **G5** | 지표·로깅 | `/metrics` 에 요청 수·지연·outbox 적체 지표가 나오고 레이블 규칙(식별자 금지)을 지킴 | 후보 교체 |
| **G6** | Grafana 임베드 | Public dashboards 가 사이트에 임베드되고 편집·탐색 UI 가 노출되지 않음 | 익명 Viewer + 프로비저닝 대시보드 |
| **G7** | nginx | ① 사용할 이미지에서 `nginx -V` 로 `realip` 포함 확인 ② 클라이언트가 보낸 주소 헤더가 버려지고 정규화됨 ③ Oracle 경로 TLS 자동 발급·갱신 방식 확정 | 모듈 포함 이미지 사용 또는 직접 빌드, 인증서 발급 컨테이너 분리 |
| **G8** | Envoy Gateway on k3d | HTTPRoute 로 `/api`, `/ws`(WebSocket), `/` 가 라우팅됨 | 다른 구현체 |
| **G9** | Testcontainers on Bun | (선택) Bun 에서 동작 | compose 서비스 유지 |
| **G10** | Drizzle 마이그레이션 | `generate --custom` raw SQL 이 부분 인덱스·어드바이저리 락 보조 객체를 만들고, 빈 DB 에서 처음부터 적용·재현됨 | 마이그레이션 SQL 직접 관리 |
| **G11** | Cloudflare 정적 미러 | 원본을 내렸을 때 무료 한도 안에서 정적 페이지 응답(ADR-023) | nginx 폴백만 유지 |
| **G12** | 무료 외부 백업 저장소 | 카드 없이 가입·업로드·복원 가능(ADR-023) | 로컬만, 수동 반출 절차 |

## 12. 버전 고정 정책

- **잠금 파일(`bun.lock`)을 커밋**하고 CI 는 잠금 기준으로 설치한다.
- Drizzle 은 **0.45.x 로 고정**한다. 1.0 안정판이 나오면 업그레이드 ADR 을 쓴다(마이그레이션 이력 변환 포함).
- 컨테이너 이미지는 **메이저(+마이너) 태그 고정**(`postgres:18`, `oven/bun:1.4` 등)하고 갱신 주기를 정한다.
- 이 문서의 버전은 조사 시점 값이다. **구현 시작 시 한 번 재조회**해서 갱신한다.
- 보안 패치는 정기 점검 항목이다(공급망 점검은 `supply-chain-audit` 스킬 기준).

## 13. 미결

| 항목 | 결정 시점 |
|---|---|
| 로깅·지표 라이브러리 | G5 |
| DB 드라이버 | G4 |
| Oracle 경로 TLS 자동화 방식 | G7 |
| Redis vs Valkey, 클라이언트 | ADR-006 측정(Phase 2) |
| E2E 도구 | E2E 시작 시 |
| 3D·게임 관련 라이브러리 | Phase 1 |
| 백업 실행 도구(cron/컨테이너)·암호화 도구 | M1 후반(방식은 ADR-023) |
