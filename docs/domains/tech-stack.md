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
2. **무료 자원의 풋프린트**: 집 PC 한 곳(Oracle Always Free 는 신용카드가 없어 미추진, 2026-11-05)에서 상시 돌아야 한다. 컨테이너 수와 메모리가 선택의 기준이다.
3. **공식 근거가 있는 것을 기본으로, 근거가 부족한 것은 관문으로** 확인한다. 조사가 못 채운 곳을 취향으로 채우지 않는다.
4. 같은 이미지·같은 설정 계약으로 **집 PC(라이브) / k3d(검증)** 를 지원한다. Oracle 은 선택적 후속(현재 미추진)이다(ADR-002).

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
| 입력 검증 | TypeBox (Elysia 내장 방식) | — | 확정 | 메시지 스키마의 정본은 `packages/protocol`. 별도 설치한 `@sinclair/typebox` 0.34 를 Elysia 라우트에 그대로 쓸 수 있음(실측). `typebox` 1.x 는 Elysia 1.4.30 peer 범위(`< 1`) 밖이라 쓰지 않는다. 스키마에 `discriminator` 옵션은 넣지 않는다(비표준 키). 브라우저는 `Value.Check` 만(약 13.9KB gzip) — `TypeCompiler` 는 22KB 이고 `new Function` 때문에 CSP 위험(미확인) |
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
| DB 드라이버 | **Bun.sql**(Bun 내장) | Bun 1.4.4 | **G4 실측 통과(로컬)** | 전 항목 통과. LISTEN 전용 연결의 자동 재구독이 백엔드 종료·서버 재시작 모두에서 동작한 것은 Bun.sql 뿐(postgres.js 4.0.0 은 재시작 후 복구 못함 → 쓰려면 3.4.7 고정, pg 는 재구독 직접 구현). SQLSTATE 는 `err.code` 가 아니라 **`errno`** 문자열로 읽는다. 차선 `postgres@3.4.7` |
| 기본키 | uuid v7 | — | 확정 | 앱 생성(outbox 이벤트 id 를 트랜잭션 전에 알아야 함, ADR-017). DB 내장 `uuidv7()` 은 보조 |
| 캐시·스트림 | Redis 또는 Valkey | Redis 8.10 / Valkey 9.1 | **M1 에서 쓰지 않음**(포트 뒤 이음새만, ADR-024) | 타임딜(Phase 3) 시점에 ADR-006 측정 후 선택(ADR-031). 클라이언트 후보 ioredis 등은 그때 |

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
| 리버스 프록시 | **nginx** | 구현 시 고정 | **관문부 G7** | 경로 라우팅·WebSocket·`limit_req`. TLS 는 Funnel 이 종료해 nginx 는 평문 로컬 포트로 받는다. `realip` 모듈이 소스 기본 빌드에 없어 **사용할 이미지에 포함됐는지 확인**(Funnel 의 클라이언트 IP 헤더는 G14 ④). Oracle 경로(선택적 후속, 미추진) TLS 자동화 방식은 Oracle 을 추진할 때까지 보류 |
| 노출(집 PC) | Tailscale Funnel (`tailscale funnel`, 호스트 서비스) | v1.38.3+ (요건) | **관문부 G14** | 모든 플랜 가능·베타. 포트 443·8443·10000, `*.ts.net` 하위만, TLS 는 PC 에서 종료(nginx 는 평문 로컬 포트). WebSocket 통과·대역폭·클라이언트 IP **미확인** |
| DNS·도메인 | 없음 — `<호스트>.<tailnet 이름>.ts.net` (사용자가 이름을 고를 수 없음, MagicDNS·HTTPS 인증서 필요) | — | 가정 A-035 | Cloudflare 무료 DNS(A-006)는 폐기 |
| K8s 진입(검증본) | Gateway API **v1.7.0**, 구현체 **Envoy Gateway** v1.9.3 | — | **관문부 G8** | WebSocket(HTTPRoute) 동작과 k3d 에서의 노출은 실측 |

## 7. 인프라·배포

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 컨테이너 | Docker / Docker Compose | Docker 29.8 (로컬) | 확정 | 라이브는 Compose, 같은 이미지 |
| 로컬 K8s(검증) | **k3d** | 5.9.0 | 확정 | 로컬에 미설치 — 설치 필요 |
| 레지스트리 | GHCR | — | 확정 | |
| CI | GitHub Actions | — | 확정 | amd64·arm64 **네이티브 러너 각각 빌드 후 매니페스트 병합**. arm 러너는 공개 저장소에서 무료(비공개는 과금) → 저장소 공개 전제(A-003) |
| 배포 방식 | 호스트가 이미지를 가져가는 pull | — | 확정(세부 미결) | 가져오는 주기·트리거는 구현 시 |
| 호스팅 | 집 PC 단일 호스트(+Tailscale Funnel), 백엔드·web 모두. Oracle 은 선택적 후속(미추진, 카드 없음) | — | 확정 | ADR-003 |
| 서버 중단 대체 페이지 | 별도 주소 정적 호스팅(Cloudflare Pages `*.pages.dev` 또는 GitHub Pages — 후보, 미확정) + **수동 전환** | — | **Proposed** (Worker 절체·G13 은 도메인 확보 시 후속) | design/16, FR-122 |

## 8. 관측·부하

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 지표 수집 | **Prometheus** | 3.15.1 | 확정 | |
| 대시보드 | **Grafana** | 13.3.0 | 확정 | |
| 공개 방식 | **Public dashboards 우선** | — | **G6 로컬 통과** | `GF_SECURITY_ALLOW_EMBEDDING=true` + 익명 접근 off 로 임베드 확인(§11.1). **후퇴안 없음** — 익명 Viewer 는 임의 PromQL 이 열려 부적합, 실패 시 링크/스크린샷으로 대체 |
| 앱 지표 라이브러리 | 후보: prom-client / OpenTelemetry(`@elysiajs/opentelemetry` 1.4.11) | — | **스파이크 G5(부분 실측)** | prom-client 15.1.3 이 Bun 1.4.4 에서 Registry·Counter·Histogram·`/metrics` 동작. 단 `nodejs_gc_duration_seconds` 는 샘플 없음, `nodejs_eventloop_lag_seconds` 는 항상 0, `nodejs_active_handles` 류는 무의미 → 이벤트 루프는 `nodejs_eventloop_lag_{max,p99}_seconds` 로 본다 |
| 부하 시험 | **k6** | 2.3.0 | 확정 | Docker(`grafana/k6`)로 실행, Arm 이미지 지원은 미확인 |

## 9. 개발 도구·품질

| 영역 | 선택 | 버전 | 상태 | 비고 |
|---|---|---|---|---|
| 모노레포 | **Bun 워크스페이스 단독** | — | 확정 | Turborepo 는 빌드가 느려질 때 추가 |
| 경계 검사 | **dependency-cruiser** | 18.7 | 확정 | 계층 규칙(`domain ↛ service` 등)과 CQRS 규칙(`usecase/query ↛ 쓰기 포트`)을 정규식 규칙으로 표현, `error` 면 CI 실패 |
| 린트·포맷 | **Biome** | 2.6 | 확정 | **계층 검사는 못 한다**(`noRestrictedImports` 는 임포트하는 쪽을 구분하지 못함) → 위 도구가 맡는다 |
| 단위·통합 시험 | **`bun test`** | Bun 내장 | 확정 | `mock.module` 지원. 가짜 타이머 지원 여부는 미확인 → 시계는 포트로 주입(ADR-019) |
| DB 통합 시험 | CI 의 compose 서비스(실제 Postgres) | — | 확정 | Testcontainers 는 Bun 호환 확인 후(**G9**, 선택) |
| E2E | **Playwright** | 1.64.1 | 채택(Bun 동작 확인) | `bun add -d @playwright/test` + `bunx playwright install chromium`(브라우저 약 150MB를 CI 에서 받음) |
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
| ~~**G1**~~ | ~~Cloudflare Tunnel~~ — **폐기(Funnel 로 교체, 이력 보존). 대체는 G14** | ~~① WebSocket 이 터널을 통과한다 ② `CF-Connecting-IP` 가 붙어 nginx 에서 읽힌다~~ | — |
| **G2** | Bun WebSocket 장시간 | 목표 연결 수(측정 기준을 시험 전에 고정)에서 장시간 메모리가 증가하지 않고 재접속 복구가 정상, 느린 소비자가 메모리를 무한히 키우지 않음 | Go ws-gateway 로 교체(프로토콜을 언어 중립 스키마로 두어 교체 비용을 낮춘다) |
| **G3** | Next.js on Bun | 빌드·`standalone` 실행·SSR·ISR·정적 에셋·`next-intl`·이미지 최적화가 Bun 런타임에서 정상 | web 만 Node 22 LTS 로 실행 |
| **G4** | DB 드라이버 | Drizzle 호환 + 트랜잭션 + **LISTEN/NOTIFY 전용 연결** + `SKIP LOCKED` 동시성 시험 통과 | 후보 순서대로 대체. **로컬 실측 결과: Bun.sql 통과, 권장(ADR-022 관문 결과)** |
| **G5** | 지표·로깅 | `/metrics` 에 요청 수·지연·outbox 적체 지표가 나오고 레이블 규칙(식별자 금지)을 지킴 | 후보 교체 |
| **G6** | Grafana 임베드 | Public dashboards 가 사이트에 임베드되고 편집·탐색 UI 가 노출되지 않음 | **후퇴안 없음**(익명 Viewer 는 임의 PromQL 이 열려 부적합, §11.1). 실패 시 임베드를 포기하고 링크/스크린샷으로 대체 |
| **G7** | nginx | ① 사용할 이미지에서 `nginx -V` 로 `realip` 포함 확인 ② 클라이언트가 보낸 주소 헤더가 버려지고 정규화됨 ③ (Oracle 추진 시에만) Oracle 경로 TLS 자동 발급·갱신 방식 확정 — 현재 보류 | 모듈 포함 이미지 사용 또는 직접 빌드, 인증서 발급 컨테이너 분리 |
| **G8** | Envoy Gateway on k3d | HTTPRoute 로 `/api`, `/ws`(WebSocket), `/` 가 라우팅됨 | 다른 구현체 |
| **G9** | Testcontainers on Bun | (선택, **S1-6 에서 확인**) Bun 에서 동작 | compose 서비스 유지 |
| **G10** | Drizzle 마이그레이션 | `generate --custom` raw SQL 이 부분 인덱스·어드바이저리 락 보조 객체를 만들고, 빈 DB 에서 처음부터 적용·재현됨 | 마이그레이션 SQL 직접 관리 |
| **G11** | 별도 주소 정적 호스팅(구 Cloudflare 정적 미러) | 무료 한도 안에서 별도 주소의 정적 페이지가 응답, 가입에 카드 불요(ADR-023, design/16) | nginx 폴백만 유지 |
| **G12** | 무료 외부 백업 저장소 | 카드 없이 가입·업로드·복원 가능(ADR-023) | 로컬만, 수동 반출 절차 |
| **G13** | Worker 절체 — **보류: 도메인 확보 후에만 의미**(design/16 §5, 통과 기준은 이력으로 보존) | — | 수동 전환(B안)을 이미 채택 |
| **G14** | Tailscale Funnel (**Proposed, 미검증**) | ① `/ws/public`·`/ws/private` 형 WebSocket 이 Funnel 을 통과한다 — 측정: G1 과 같은 방식으로 에코 서버를 `tailscale funnel` 로 노출하고 wss 연결·메시지 왕복·close 코드 확인 ② 무 ping 유휴 타임아웃과 하트비트 주기 — 측정: 유휴 연결을 끊길 때까지 시각 기록, 서버 `hb` 25초로 유지되는 최대 시간 확인(관찰 상한 명시) ③ 대역폭 한도 체감 — 측정: 동시 연결 수·페이로드를 올리며 처리량·지연 기록(한도 수치는 비공개라 체감만) ④ 클라이언트 IP 확보 여부 — 측정: 에코 서버가 수신 헤더 전체와 소켓 주소를 출력해 실제 IP 를 담은 헤더가 있는지 확인 ⑤ 재시작 후 주소 유지 — 측정: `tailscaled`·호스트 재시작 뒤 같은 `*.ts.net` 주소·Funnel 설정이 유지되는지 ⑥ 인증서 갱신 — 측정: 인증서 만료일 기록, 갱신 후 연결 유지 확인(관찰 기간 명시) | ① 실패 → SSE 등 대체(ADR-003 후속) ④ 확보 불가 → 속도 제한을 세션/계정 기준으로만 ③ 한도 부족 → 자산 축소·재검토 |

**쿼리 계층**: 기본 Drizzle 빌더, 표현 불가·측정 정당화 시에만 같은 `tx` 의 `sql` 템플릿(T1), 트랜잭션 밖 전용 연결(T2: LISTEN, 리더 락). 규칙과 raw 레지스트리는 [ADR-025](../adr/ADR-025-query-layer.md).

### 11.1 관문 로컬 실측 요약 (2026-11-04, WSL2·Bun 1.4.4·Docker)

| 관문 | 결과 | 비고 |
|---|---|---|
| G1 (폐기, 이력 — Funnel 에는 적용되지 않음) | **통과(로컬, Cloudflare 임시 터널)** | trycloudflare 임시 터널(cloudflared 2026.10.7)에서 wss 업그레이드·64KB/512KB 에코·서버 close 1001/4408 이 사유까지 그대로 도달, `CF-Connecting-IP`·`X-Forwarded-Proto`·`CF-Ray` 부착. 유휴 ping 이 없으면 약 126초(125.6~126.5초 3회)에 1006 으로 끊기고 서버 hb 25초면 252초(관찰 상한)까지 유지. 에지는 클라이언트의 `X-Forwarded-For`·`True-Client-IP` 를 지우지 않으므로 nginx 정규화(덮어쓰기)가 필수이고, 클라이언트가 보낸 `CF-Connecting-IP` 요청 헤더는 에지가 403(error 1000)으로 거부한다. cloudflared→nginx→Bun 체인에서 `set_real_ip_from 127.0.0.1` + `real_ip_header CF-Connecting-IP` 가 동작. **미확인**: 정식 Named Tunnel·Access 정책·다중 커넥터(HA)·재연결(계정 필요), 임시 터널과 정식 터널의 유휴 한도 차이 |
| G2 | **통과(조건부, 로컬)** | 1000연결(public 900 + private 100)·초당 20건·22분 소크: 유실·순서 어긋남 0, RSS 34.3→36.5MB 후 평탄(5분 이후 기울기 +0.45MB/h, 오차 수준). 느린 소비자: **앱 레벨 큐(64건/256KB)가 10/10 을 4408 로 격리**, RSS 평탄. 재접속 폭풍: SIGTERM+bye 는 5초 안에 전량 복구·접속 실패 0, kill -9 는 접속 실패 59~72건 후 1~3초에 복구. `await server.stop()` 은 1000연결에서도 교착(5초 후에도 연결 1000개 잔존) → stop() 을 await 없이 호출하고 bye+close(1001) 후 연결 0 대기(10~14ms). 조건: 앱 레벨 큐 유지, `stop()` await 금지. **미실행**: 수 시간 소크, 부하 20건/초 외 조건 |
| G3 | **통과(조건부, 로컬)** | Next 16.4.5·React 19.3.1 이 Bun 1.4.4 에서 빌드(Turbopack 기본, 약 5.9초)·standalone(41MB)·SSR·ISR·재검증·Server Action·next-intl·next/image(sharp)·우아한 종료(종료 코드 143)·Docker(`oven/bun:1.4` 멀티스테이지, 최종 341MB, 헬스체크 `bun -e fetch`)·dev HMR 정상. Node 25 대비(단일 측정, 참고치) 부하 후 RSS 186 vs 413MB, `/ko` 평균 8.3 vs 15.9ms. Bun 은 의존성 postinstall 을 기본 차단하나 sharp 는 optionalDependency 라 동작. **조건**: nonce CSP 는 정적·ISR 페이지에서 하이드레이션을 깨뜨림 → 모든 페이지 동적 렌더로 확정(10 §2). **미실행**: Node 22 LTS 직접 비교(호스트에 Node 25 만 있음), `bunx shadcn` CLI 호환 |
| G6 | **통과(로컬)** | Public dashboards 가 다른 오리진 iframe 에서 렌더(패널 결과 표시, 콘솔 오류 없음). 필요: `GF_SECURITY_ALLOW_EMBEDDING=true`(기본은 `X-Frame-Options: deny`), 익명 접근은 off 유지, iframe `sandbox="allow-scripts allow-same-origin"`(둘 다 필수), 사이트 CSP `frame-src` 에 Grafana 공개 출처 1개. 공개 URL 에서 `/explore`·다른 대시보드·`/api/search`·`/api/datasources`·`/api/ds/query` 는 막히고 쿼리 API 는 저장된 패널 쿼리만 실행(임의 `expr` 무시). 주의: 공개 페이지 HTML 에 데이터 소스 이름·uid·내부 URL 이 노출, Grafana 포트 `/metrics` 무인증(프록시 차단 대상), 공개 토큰이 곧 자격(유출 시 해제·재발급). **익명 Viewer 안은 `POST /api/ds/query` 로 임의 PromQL 이 실행(`count({__name__=~".+"})` 200)되고 다른 대시보드·데이터 소스 목록이 열려 후퇴안으로도 부적합** |
| G8 | **통과(로컬, k3d v5.9.0)** | Gateway Programmed=True, `/api`·`/ws/`(WS 업그레이드·왕복)·`/` 라우팅. Gateway API v1.7.0 + Envoy Gateway v1.9.3 를 그대로 helm 설치하면 CRD(차트 내장 v1.6.1) 충돌 → `kubectl apply --server-side` 로 v1.7.0 표준 채널, EG 차트는 `--set crds.enabled=false` + 차트 `crds/generated` 의 EG CRD 별도 적용. 유휴 타임아웃 기본값은 사실상 무제한(504초 유지), 조정은 `ClientTrafficPolicy`/`BackendTrafficPolicy` 의 `spec.timeout.http.streamIdleTimeout`(`requestTimeout`·`connectionIdleTimeout` 은 WS 에 효과 없음). 롤링 중 WS: `preStop sleep 5` + readyz 503 + bye/1001 → 새 연결 실패 0/1156, 연결 40개 모두 1001 로 종료·첫 시도 재접속 성공; preStop 없이 우아한 종료만이면 새 연결 실패 26/837. 주소 헤더 정규화는 `ClientTrafficPolicy` `headers.earlyRequestHeaders`(remove `x-forwarded-for`·`cf-connecting-ip`, set `x-real-ip=%DOWNSTREAM_REMOTE_ADDRESS_WITHOUT_PORT%`; `x-real-ip` 를 remove 와 set 에 동시에 두면 사라짐). 운영 경로는 catch-all 에 걸려 노출되므로 `HTTPRouteFilter` `directResponse` 404 + 정확 일치 HTTPRoute. 리소스: EG 컨트롤 플레인 40~84Mi, 프록시 17~54Mi. **미확인**: 호스트 실 클라이언트 IP(k3d serverlb 가 L4), WS 업그레이드 요청에서의 헤더 정규화, `sectionName` 단위 정책 |
| G9 | **통과(로컬)** | testcontainers 12.2.1 + postgres:18.6 이 bun test 에서 동작(시작 약 2~5초, 정지 0.25초). Ryuk 필수(켜면 SIGKILL 후 약 11초 안에 정리, 끄면 12초 뒤에도 누수). `bun test --parallel` 에서는 preload 가 워커마다 컨테이너를 만들므로 **래퍼가 컨테이너 1개를 띄우고 `DATABASE_URL` env 로 공유**(총 4.0초). `beforeAll` 기본 5초는 부족 → 60초. compose Postgres 대안은 템플릿 DB 복제(`CREATE DATABASE … TEMPLATE`, WAL_LOG 중앙값 약 36ms, 병렬 8개 191ms, 복제본 10개 삭제 4.2초) |
| 도구 | **확인(로컬)** | gitleaks 8.30.1: 저장소 이력 9커밋 누출 0, 기본 규칙에 Discord 웹훅이 없어 `.gitleaks.toml` 사용자 규칙 필요(추가 후 합성 비밀 3건 모두 검출), CI 는 `git` 모드·pre-commit 은 `gitleaks git --staged`(작업 트리 `dir` 모드는 `.claude/skills/*/references/secrets.md` 예제 오탐). age 1.3.2: `-r` 공개키만으로 암호화, 개인키 없이 복호화 불가(`identities are required`), 50MB 0.10초. Playwright 1.64.1: `bun add -d @playwright/test` + `bunx playwright install chromium`(약 150MB)으로 Bun 에서 동작 → **E2E 도구로 채택** |
| G4 | **통과(로컬)**, Bun.sql 권장 | Drizzle 0.45.4 의 bun-sql·postgres-js·node-postgres 어댑터 모두 동작. 어떤 드라이버든 끊긴 동안의 NOTIFY 는 유실되므로 재구독 후 `change_log` 를 마지막 seq 부터 다시 읽는 보정은 유지 |
| G7 ①② | **통과(로컬)** | 공식 nginx 이미지(stable·alpine·mainline) 모두 realip 포함. 신뢰 대역 밖 `CF-Connecting-IP` 는 무시되고 위조 `X-Forwarded-For` 등은 정규화. 신뢰 대역은 Cloudflare 전제였으므로 폐기, Funnel 용 신뢰 대역·헤더는 G14 ④ 에서 확인 필요 |
| G11·G12 | **미확인(계정 필요)** | 정적 호스트·외부 저장소 가입이 필요해 로컬에서 확인할 수 없다. (G13 은 보류, G14 는 Tailscale 계정·실제 Funnel 이 필요해 로컬에서 확인할 수 없다.) 구현 단계에서 사용자가 계정을 만든 뒤 확인 |
| G7 ③ | 미확인 | 이미지에 `ngx_http_acme_module.so` 가 있으나 동작 시험은 안 함 |
| G10 | **통과(로컬)** | 아래 운영 규칙 |

**Drizzle 마이그레이션 운영 규칙(G10 실측)**: ① `drizzle-kit push` 금지 — 스키마 정의에 없는 raw 부분 인덱스·CHECK 를 지우려 한다. `generate` + `migrate` 만 쓴다. ② 대기 중 마이그레이션은 한 트랜잭션이라 `CREATE INDEX CONCURRENTLY` 불가(필요하면 별도 절차). ③ 이미 적용된 파일을 고치면 해시 검사가 없어 조용히 무시된다 → 적용된 파일은 수정 금지. ④ 이력의 마지막 `when` 보다 과거인 새 마이그레이션은 조용히 건너뛴다 → 브랜치 병합 시 저널 순서 확인. ⑤ `schemaFilter` 는 스키마 이름을 나열한다(`*` 불가). ⑥ raw 객체(부분 인덱스·함수·트리거) 목록은 스냅샷에 없으므로 따로 관리한다.

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
| ~~DB 드라이버~~ | G4 로컬 실측으로 Bun.sql 선택(실서버 재시험은 S0-4) |
| Oracle 경로 TLS 자동화 방식 | Oracle 추진 시(현재 미추진) |
| Redis vs Valkey, 클라이언트 | ADR-006 측정(타임딜 Phase 3, ADR-031) |
| ~~E2E 도구~~ | Playwright 1.64.1 채택(Bun 동작 확인, §11.1) |
| 3D·게임 관련 라이브러리 | Phase 1 |
| 백업 실행 도구(cron/컨테이너) | M1 후반(systemd 타이머, ADR-027). 암호화는 age 1.3.2 확인(§11.1) |
| G11 별도 주소 정적 호스팅, G12 무료 외부 백업 저장소, G14 Tailscale Funnel (G13 Worker 절체는 보류) | 계정 필요, 구현 단계 |
| 수 시간 소크, Node 22 LTS 직접 비교 (정식 Named Tunnel·Access·다중 커넥터는 Cloudflare 폐기로 해당 없음) | S0 실서버 재시험 |
