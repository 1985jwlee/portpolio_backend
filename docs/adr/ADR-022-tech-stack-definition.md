# ADR-022: 전체 기술 스택 확정과 구현 초기 검증 관문
- 상태: Accepted (2026-11-06 정정: 엔진 언어 표의 출처인 에이전트 가이드는 로컬 전용 파일이며 추적 대상이 아니다 — 아래 ‘엔진 언어 표와의 관계’)
- 날짜: 2026-11-04
- 근거: 사용자 지시("명세 확정 전에 전체 기술 스택을 정의") / 인터뷰 R11 / 웹 조사 2건(2026-11-04, 공식 문서·릴리스 기준) / 정본 표는 [tech-stack.md](../domains/tech-stack.md)

## 맥락
ADR-004 는 핵심 스택(Bun · Elysia · Next.js · WebSocket · 공유 타입)만 정했고, ORM·프록시·린트·테스트·OAuth·CI 등은 "구현 시 선정(미결)"로 남겼다. 이 미결이 흩어져 있으면 구현 첫날 결정이 쏟아지고 서로 어긋난다. 명세를 확정하기 전에 **스택 전체를 한 표로 닫고**, 공식 근거가 부족한 곳은 **관문으로 명시**해야 한다. 또한 이 엔진의 언어별 역할 표(WebSocket·고성능 → Go 등)와 이 프로젝트의 선택이 일부 달라서, 어떤 부분이 의도적 이탈인지 기록해야 한다.

## 결정
스택 전체는 [tech-stack.md](../domains/tech-stack.md) 가 정본이다. 이 ADR 은 **결정의 이유, 추천에서 바뀐 곳, 관문**만 기록한다.

### 확정된 핵심
| 영역 | 결정 |
|---|---|
| 런타임 | Bun(전 컨테이너, web 포함), TypeScript 엄격 |
| 백엔드 | ElysiaJS 1.4.x, TypeBox 검증, **GitHub OAuth 직접 구현** |
| 데이터 | PostgreSQL 18, **Drizzle 0.45.x 고정**(1.0 rc 는 안정화 후), 마이그레이션 forward-only |
| 프론트 | Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, TanStack Query, next-intl, 브라우저 내장 WebSocket + 직접 재접속 |
| 진입 | **nginx**, Tailscale Funnel(집 PC, 2026-11-05 Cloudflare Tunnel 에서 교체), Gateway API + Envoy Gateway(k3d 검증) |
| 관측 | Prometheus, Grafana **Public dashboards 우선**, k6 |
| 도구 | Bun 워크스페이스 단독, **dependency-cruiser**(계층·CQRS 경계), **Biome**, `bun test` |
| CI | GitHub Actions, amd64·arm64 네이티브 러너 → GHCR |
| 쓰지 않는 것(M1) | Go · Rust · Python · C# · C++, Redis/Valkey, Turborepo |

### 추천에서 바뀐 결정 (사용자 선택)
| 항목 | 추천 | 사용자 선택 | 감수하는 위험 | 완화 |
|---|---|---|---|---|
| web 실행 런타임 | Node 22 LTS 로 실행(빌드·패키지는 Bun) | **Bun 으로 실행** | Next 공식 요구는 Node ≥ 20.9 이고 Bun 실행은 Next 쪽 보증·한계 기록이 없다. 장애 시 원인 분리가 어렵다 | **관문 G3**(빌드·SSR·ISR·`next-intl`·이미지 최적화 검증). 실패하면 web 만 Node 22 LTS. 컨테이너 이미지가 분리돼 있어 교체 범위가 web 하나다 |
| 리버스 프록시 | Caddy | **nginx** | `realip` 모듈이 소스 기본 빌드에 없어 이미지 확인이 필요하고, Oracle 경로(선택적 후속, 미추진) TLS 자동화가 별도 구성이다(ACME 모듈 또는 발급 컨테이너) | **관문 G7**(`nginx -V`, 헤더 정규화, TLS 방식 확정). 속도 제한은 `limit_req` 가 내장이라 Caddy 대비 이점이 있다 |

### 조사가 바꾼 이전 결정
| 이전 | 변경 | 이유 |
|---|---|---|
| ADR-007: Grafana 익명 읽기 전용 뷰 + iframe 임베드 | **Public dashboards 우선**, 임베드는 G6 로컬 실측으로 통과(`GF_SECURITY_ALLOW_EMBEDDING=true`). **후퇴안은 없다**(익명 Viewer 는 임의 PromQL 이 열려 부적합) — 안 되면 링크/스크린샷으로 대체 | Grafana 공식 문서가 익명 접근보다 Public dashboards 를 더 안전한 공유 방법으로 안내 |
| ADR-004: OAuth 라이브러리 미정 | 직접 구현 | Arctic 은 2026-07 deprecated, Better Auth 는 토큰 해시 저장 여부가 문서에 없어 `identity.session` 설계와 충돌 가능 |
| ADR-004: ORM 후보 | Drizzle 0.45.x 고정 | 엔진 규약상 DB 정본은 Drizzle. 1.0 은 rc 이고 마이그레이션 폴더 구조가 바뀜 |
| ADR-001: 경계 검사 도구 미정 | dependency-cruiser | 계층·CQRS 규칙을 정규식 규칙으로 표현 가능. Biome 는 임포트하는 쪽을 구분하지 못해 부적합 |

## 설계 상세

### 엔진 언어 표와의 관계
이 엔진의 언어별 역할 표(과거 로컬 에이전트 가이드에 있었으나 스택 판정은 프로젝트 사실이라 에이전트 시스템에서 분리했다 — 이 프로젝트의 정본은 [tech-stack.md](../domains/tech-stack.md); 개정 2026-11-06, 사용자 결정으로 공개 저장소에 두지 않음)는 여러 프로젝트 공통의 기본값이다. 이 프로젝트는 **M1 에서 TypeScript 하나로 간다.** 표와 다른 곳은 ws-gateway 하나(표는 Go, 여기는 Elysia)이며 **의도적 이탈**이다.
- 근거: 프로토콜 타입을 서버·클라이언트가 공유(ADR-004), 컨테이너 이미지 하나로 세 엔트리포인트, 무료 자원의 풋프린트.
- 위험: Bun 의 다수 연결 장시간 안정성에 공식 근거가 없다 → **관문 G2.**
- 교체 가능성: 프로토콜 메시지 스키마를 TypeBox 정의에 묶지 않고 **언어 중립 스키마(JSON Schema 로 내보낼 수 있는 형태)** 로 유지해, G2 실패 시 Go 로 교체해도 클라이언트·프로토콜이 바뀌지 않게 한다.

### ws-gateway 언어 비교 측정 (2026-11-04) — 결정: Elysia(Bun) 유지
> **증거 규칙 주석(ADR-050, 2026-11-06)**: 아래 수치는 재현 스크립트·원시 결과가 저장소에 없다 → **재현 스크립트 필요(결과만 있음) → 참고값(재현 불가)**. 삭제하지 않고 강등 표기만 한다.

Go(coder/websocket)·C#(.NET 10 Kestrel 순수 WebSocket)·Bun(Elysia)로 같은 코어를 만들어 비교했다. WSL2 loopback, 서버 2코어·부하 생성기 4코어, 3회 반복 중앙값이라 **상대 비교에만 유효**하다.
| 항목 | Go | C# | Bun |
|---|---|---|---|
| 유휴 RSS 10k 연결 | 299MB | 229MB | 89MB |
| 연결당 증가분(10k) | 약 30KB(기본 버퍼, 튜닝 여지) | 약 17KB | 약 5.5KB |
| 팬아웃 1k·초당 10건 p50/p99 | 3.3/21.9ms | 3.7/9.2ms | 2.8/11.1ms |
| 팬아웃 1k·초당 100건 p50/p99 | 2.5/11.4ms | 2.8/8.8ms | 2.45/13.9ms |
| 5k·초당 10건 p50/p99 | 18.2/76ms | 18.4/63ms | **11.0/29.4ms** |
| 유실·중복 | 0 | 0 | 0 |
| 느린 소비자(100연결 중 10개 미독·초당 2000건) | 10/10 서버가 끊음(15MB) | 10/10 서버가 끊음(90MB) | **설정 위치에 따라 다름 — 아래** |
- 목표 규모(동시 50, 최대 수천)에서 세 언어 모두 충분하다. 성능은 언어를 바꿀 이유가 되지 않았다.
- **정정(2026-11-04, 재측정)**: 처음 표의 Bun 지연(1k·초당 100건 1.8/4.6ms 등)은 Bun 서버가 `performance.timeOrigin + performance.now()` 로 찍은 타임스탬프가 벽시계에서 어긋나 만든 값이었다(이 WSL2 호스트에서 분당 수 초 어긋남을 G2 소크에서 확인). `Date.now()` 로 고쳐 같은 호스트 상태에서 세 언어를 다시 잰 값이 위 표다. 결론이 약해졌다: **Bun 은 Go·C# 과 "비슷하다"**(1k 구간에서는 사실상 동률, `Date.now()` ms 해상도 한계로 낮은 지연 구간의 상대 오차가 크다). **5k 연결 구간에서만 p50 이 약 40% 낮고 p99 도 낮다.** 메모리와 느린 소비자 결과는 타임스탬프와 무관해 그대로다. 측정 중 호스트에 다른 부하(dotnet, Grafana 등)가 있었고 Go·C# 은 1회뿐이라 순위는 범위로 읽는다.
- **Bun 의 느린 소비자 보호는 설정 위치에 따라 동작이 갈린다**(시나리오 4b, 각 3회):
  - `.ws()` 라우트 옵션의 `backpressureLimit`/`closeOnBackpressureLimit`: **적용되지 않음**(0/10 종료, RSS 110~120MB).
  - `new Elysia({ websocket })` 최상위 옵션: 10/10 종료되지만 **정상 연결 p99 가 531~886ms** 로 악화(원인 불명, 3회 재현).
  - 순수 `Bun.serve`: 10/10 종료, p99 0.5~0.7ms, RSS 33MB.
  - → 기본값에 기대지 않는다. **G2 에서 이 동작을 직접 시험하고**, Elysia 경유가 지연을 해치면 ws-gateway 의 WebSocket 부분만 `Bun.serve` 로 구현하거나 송신 큐 상한을 앱 코드에서 직접 둔다.
- 아래 한계: 단일 머신 루프백(TLS·프록시 미포함), 팬아웃 지연은 반복 간 편차가 커서 순위가 아니라 범위로 읽는다.
- 이 측정은 단시간이다. 며칠 단위 안정성은 여전히 G2 가 답한다. 한계: 부하 생성기가 약 1코어를 써서 지연 차이에 생성기 영향이 섞인다.
- C# 은 SignalR 이 프로토콜 고정으로 맞지 않고(순수 WebSocket 만 가능), Prometheus 라이브러리가 약하며, 스키마→판별 유니온 생성기가 미확인이라 Go 보다 교체 후보로 열세다. **G2 실패 시 교체 대상은 Go.**

### 구현 초기 관문 (tech-stack.md §11)
조사가 결론을 못 낸 열 가지다. M1 구현의 **단계 0** 에서 처리하고, 결과를 이 ADR 에 추가한다.
| 관문 | 한 줄 |
|---|---|
| G1 | ~~Cloudflare Tunnel 의 WebSocket 통과와 `CF-Connecting-IP` 부착~~ — **폐기(Funnel 로 교체, 이력 보존)**. 대체는 G14 |
| G2 | Bun WebSocket 장시간·다수 연결 안정성 |
| G3 | Next.js 를 Bun 으로 실행 |
| G4 | DB 드라이버(LISTEN/NOTIFY 전용 연결, SKIP LOCKED) |
| G5 | 지표·로깅 라이브러리의 Bun 호환 |
| G6 | Grafana Public dashboards iframe 임베드 |
| G7 | nginx `realip`·헤더 정규화·TLS 자동화 |
| G8 | Envoy Gateway 의 k3d WebSocket 라우팅 |
| G9 | Testcontainers on Bun (선택) |
| G10 | Drizzle raw SQL 마이그레이션 재현 |
| G11·G12 | 별도 주소 정적 호스팅(구 Cloudflare 정적 미러) · 무료 외부 백업 저장소 (ADR-023 에서 추가) |
| G13 | Worker 절체 — **보류(도메인 확보 후에만 의미)**, design/16 |
| **G14** | **Tailscale Funnel** — WebSocket 통과·유휴 타임아웃·하트비트 주기, 대역폭 체감, 클라이언트 IP 확보, 재시작 후 주소 유지, 인증서 갱신 (**ADR-051 Accepted 2026-11-14 — [ADR-051](ADR-051-funnel-g14-measurement-results.md)**; 갱신·재부팅·대역폭 변동 관찰은 `design/11` S0 잔여 항목) |

관문 중 **G1·G2 가 설계를 바꿀 수 있는 크기**다(G1 실패 → 실시간 방식, G2 실패 → ws-gateway 언어). 나머지는 도구 교체로 흡수된다.

### 관문 로컬 실측 결과 (2026-11-04)

> **증거 규칙 주석(ADR-050, 2026-11-06)**: 아래 수치는 재현 스크립트·원시 결과가 저장소에 없다 → **재현 스크립트 필요(결과만 있음) → 참고값(재현 불가)**. 삭제하지 않고 강등 표기만 한다.

개발 PC(WSL2), Bun 1.4.4, Docker(postgres:18.6, nginx 1.30/1.31)에서 실행했다. 실서버는 네이티브 Ubuntu 24.04(6코어 1.9GHz, AVX2 있음, RAM 62GB — ADR-033 '호스트 프로필')이며, 그 호스트(Funnel 경유)에서의 재시험은 S0 에서 한다(G2·G3·G14 와 k6).

| 관문 | 결과 | 설계 영향 |
|---|---|---|
| G4 DB 드라이버 | **2026-11-10 재현 스크립트로 개발 PC 재측정 PASS(기준 8개 3회, [spikes/g4-g10-db](../../spikes/g4-g10-db/README.md)), 호스트 재측정은 아직.** 아래는 2026-11-04 이전 기록(참고값): **Bun.sql 통과·권장.** Bun.sql·postgres.js 4.0.0·pg 모두 바인딩·트랜잭션·`SKIP LOCKED` 1000행×8워커(중복 0)·늦은 완료 0행 거절·advisory 리더 선출 통과. LISTEN 자동 재구독은 Bun.sql 만 서버 재시작까지 복구, postgres.js 4.0.0 은 재시작 후 복구 못함(3.4.7 은 복구) | 드라이버 = Bun.sql. SQLSTATE 는 `errno`. NOTIFY 유실 보정(change_log 재조회) 필수 |
| G7 nginx | **2026-11-10 재현 스크립트로 개발 PC 재측정 PASS(Funnel 기준 10개 3회, [spikes/g7-nginx-realip](../../spikes/g7-nginx-realip/README.md)), 호스트 재측정은 아직.** 아래는 이전 기록(참고값): ①② 통과. 공식 이미지 4종 모두 realip 포함, 신뢰 대역 밖 헤더 무시, 위조 헤더 정규화, WS 101, `limit_req` 429, 업스트림 다운 시 정적 폴백 서빙. ③ TLS 자동화 미확인(이미지에 acme 모듈 존재) | 직접 빌드 불필요. 내부 경로 차단은 대소문자 무시 정규식(`location ~*`) |
| G10 Drizzle | **2026-11-10 재현 스크립트로 개발 PC 재측정 PASS(기준 10개 3회, 새 DB 두 개의 스키마 덤프 바이트 동일, [spikes/g4-g10-db](../../spikes/g4-g10-db/README.md)).** 아래는 이전 기록(참고값): 통과. `generate --custom` 으로 부분 인덱스·CHECK·함수·트리거 적용, 빈 DB 재현·멱등, 두 마이그레이터 동작 | 운영 규칙 6개(tech-stack §11.1): push 금지 등 |
| G1 Cloudflare Tunnel (폐기, 이력) | **통과(임시 터널, Funnel 에는 적용되지 않음).** wss 업그레이드·64KB/512KB 에코·close 1001/4408 그대로 도달, `CF-Connecting-IP` 부착, 유휴 ping 없으면 약 126초에 1006(hb 25초면 유지). 에지는 클라이언트의 `X-Forwarded-For`·`True-Client-IP` 를 지우지 않고 `CF-Connecting-IP` 요청 헤더는 403(error 1000)으로 거부. 정식 Named Tunnel·Access 는 미확인 | nginx 주소 헤더 정규화 필수, hb 25초 필수 |
| G2 Bun WS | **조건부 통과.** 1000연결 22분 소크 RSS 기울기 +0.45MB/h(참고)·유실 0, SIGTERM+bye 재접속 폭풍 5초 내 전량 복구, 앱 레벨 큐가 느린 소비자 10/10 을 4408 로 격리. Bun.serve 네이티브 `closeOnBackpressureLimit` 은 1006 으로만 끊고 Elysia 라우트 옵션은 여전히 무시(0/10), Elysia 최상위 옵션의 이전 p99 악화는 이번 조건에서 재현 안 됨(결론 유보 — **2026-11-11 34회 비교에서도 재현 안 됨**, 라우트 옵션 무시는 6/6 재현, 최상위·네이티브 옵션은 `1006` 만; Elysia 위 앱 큐는 `ws.raw` 우회로 `Bun.serve` 와 동등: [spikes/g2-elysia-compare](../../spikes/g2-elysia-compare/ENV.md)). 수 시간 소크는 미실행. **2026-11-10 재현 스크립트로 개발 PC 재측정(82분 소크·재접속 폭풍·접속·해제 6만 회 모두 PASS, [spikes/g2-ws-soak](../../spikes/g2-ws-soak/README.md))**, 호스트 재측정은 아직 | 앱 레벨 큐 유지, `stop()` await 금지, 클라이언트는 4408 코드에 의존한 분기 금지(느린 연결은 close 프레임을 못 받음), 서버 타임스탬프는 `Date.now()` |
| G3 Next on Bun | **조건부 통과.** 빌드·standalone(41MB)·SSR·ISR·재검증·Server Action·next-intl·next/image·종료(143)·Docker(341MB)·HMR 정상, Bun 이 Node 25 보다 같거나 빠름(단일 측정). nonce CSP 는 정적·ISR 에서 하이드레이션을 깨뜨림 | **모든 페이지 동적 렌더 + nonce CSP 유지, ISR 포기**(10 §2). proxy matcher 에서 `/healthz`·`/readyz`·`/metrics`·`/api` 제외 |
| G6 Grafana 임베드 | **통과.** Public dashboards 다른 오리진 iframe 렌더, 편집·탐색·타 대시보드 차단, 쿼리는 패널 저장 쿼리만. 익명 Viewer 는 임의 PromQL 실행 | 후퇴안 없음(ADR-007). `ALLOW_EMBEDDING=true`, sandbox `allow-scripts allow-same-origin`, 공개 출처 1개 `frame-src` |
| G8 Envoy Gateway on k3d | **통과.** 라우팅·WS 왕복 확인. v1.7.0 CRD + EG v1.9.3 helm 설치는 CRD 충돌 → 우회 절차 필요. 유휴 타임아웃 기본 무제한, 롤링 중 `preStop sleep 5` 조합으로 새 연결 실패 0/1156(없으면 26/837) | 설치 절차·`streamIdleTimeout` 정책·`earlyRequestHeaders` 정규화·`directResponse` 404 (F17) |
| G9 Testcontainers | **통과.** 병렬 실행은 래퍼 1컨테이너 + `DATABASE_URL` 공유, Ryuk 필수, 훅 타임아웃 60초 | 08·09 |
| (G2 보조) Bun/Elysia | `await server.stop()` 은 WS 가 열려 있으면 교착 → `stop()` 을 await 없이 호출하고 `bye`+`close(1001)` 후 타임아웃 대기. 업그레이드 사전 검사·`ws.send` 반환값(-1/0)·두 경로 분리는 Elysia 와 Bun.serve 모두 동작. 라우트 옵션 `backpressureLimit` 의 **차단 동작은 미검증**(앞선 측정에서는 무시) | 앱 레벨 큐 상한 유지 |
| 기타 | `timingSafeEqual` 은 길이가 다르면 예외 → 해시 후 비교. `Bun.randomUUIDv7()` 내장(시간 정렬 확인). prom-client 는 Bun 에서 GC 지표 샘플 없음, `eventloop_lag_seconds` 0. 별도 `@sinclair/typebox` 를 Elysia 에 사용 가능(typebox 1.x 는 peer 범위 밖), 브라우저는 `Value.Check` 만(약 13.9KB gzip) | F16·F17 반영 |

## 로컬 환경
로컬에 `psql`, `redis`, `k3d`, `kubectl`, `k6` 이 없다. 모두 Docker 컨테이너 또는 설치로 준비한다(Docker 29.8 은 있음). Bun 은 1.4.4 로 맞췄다(로컬 확인 완료).

## 대안과 기각 이유
- **Node 중심 스택(Fastify/Nest + Vitest)**: 근거가 더 많지만 Bun 의 풋프린트·한 런타임 이점과 이미 확정된 Elysia 선택(ADR-004)을 되돌려야 한다.
- **Go 또는 C# ws-gateway 를 처음부터**(측정은 위 절): 안정성 위험은 없지만 타입 공유를 포기하고 언어가 둘이 된다. 위험을 관문으로 관리하는 쪽을 택했다.
- **Better Auth / Auth.js**: 개발이 빠르지만 세션 스키마를 라이브러리가 정해 설계와 충돌 가능.
- **Turborepo / Nx**: 빌드 캐시 이점은 규모가 커졌을 때. 지금은 비용만 든다.
- **Vitest**: 기능이 풍부하나 Node 중심(`^22.12`/`^24`)이고, Bun 런타임과 두 벌의 시험 환경이 된다.

## 결과
- 얻는 것: 스택 미결이 한 표로 닫힌다. 근거 부족은 관문으로 명시돼 "조용한 가정"이 없다. 의도적 이탈이 기록된다.
- 치르는 것: 구현 초기에 열 개 관문을 통과해야 한다. 두 선택(web=Bun, nginx)은 추천보다 위험이 높아 관문 비용이 든다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 관문이 많아 구현 착수가 늦어짐 | 단계 0 에서 병렬 스파이크. G1·G2 우선, 나머지는 해당 기능 구현 직전 |
| 관문 실패 시 연쇄 재설계 | 각 관문에 대안을 미리 정함. 프로토콜 언어 중립 스키마로 G2 비용 축소 |
| 버전이 조사 후 바뀜 | 구현 시작 시 재조회, 잠금 파일 커밋 |
| 조사가 놓친 호환성 문제 | 관문은 "문서 읽기"가 아니라 **실제 실행**으로 통과시킨다 |

## 검증 방법
- 각 관문의 통과 기준(tech-stack.md §11)을 시험으로 남기고 결과를 이 ADR 에 추가한다.
- 구현 시작 시 tech-stack.md 의 버전을 재조회해 갱신한다.

## 실서비스라면
Node LTS 와 검증된 프레임워크 조합을 기본으로 하고, 새 런타임은 관문 대신 단계적 도입(카나리)으로 위험을 줄인다. 프록시는 매니지드 로드밸런서, 인증은 검증된 인증 서비스를 쓴다.

## 재검토 조건
G1 또는 G2 실패. Next.js 가 Bun 을 공식 지원하거나 반대로 명시적으로 미지원을 선언할 때. Drizzle 1.0 안정화.

## 관련 ADR
ADR-001, ADR-002, ADR-003, ADR-004, ADR-007, ADR-008, ADR-014, ADR-017
