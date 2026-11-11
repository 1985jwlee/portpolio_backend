# ADR-053: ws-gateway 의 소켓 계층은 `Bun.serve` 로 구현한다 (BunServeRuntime)
- 상태: **Accepted** (2026-11-11) — 사용자 결정 [권장수용]
- 날짜: 2026-11-11
- 근거: S0-2 G2 Elysia 대 Bun.serve 비교(34회) · F14 §3.1(`SocketRuntime` 경계, D4) · ADR-022(G2) · ADR-052(`ActorContext` 주입)
- 증거: [`spikes/g2-elysia-compare/ENV.md`](../../spikes/g2-elysia-compare/ENV.md) — 스크립트·원시 결과·환경·커밋 `c5a5870`(코드)/`5f1c0e7`(결과). 표기는 ADR-050 범례를 따른다.
- 관련 문서: [design/features/14-realtime.md](../design/features/14-realtime.md) §3.1 · [design/04](../design/04-ws-protocol.md) · [tech-stack §11.1](../domains/tech-stack.md)

## 맥락
F14 는 `SocketRuntime` 경계 아래 `ElysiaRuntime` 과 `BunServeRuntime` 중 하나를 G2 에서 확정하기로 했다. 비교 결과(개발 PC 한 곳, loopback, 합성 부하):
- Elysia **라우트** 백프레셔 옵션은 6/6 무시된다(격리 0/10, RSS +161~172MB).
- Elysia 위에 **앱 큐**를 올린 구성(B)은 `Bun.serve`(A)와 지연이 거의 같았다(SA 비율 1.38, SC 1.5 — 기준선 근처). 단 B 는 **`ws.raw` 로 내려가** `getBufferedAmount()` 를 읽고 보냈다.
- `ElysiaWS` 래퍼는 `getBufferedAmount` 를 노출하지 않고, 이벤트마다 **새 래퍼**를 만들며(`adapter/bun/index.mjs`), `ws.data` 는 사용자 연결 상태가 아니라 Elysia 컨텍스트다. 그래서 연결 상태가 `WeakMap<ws.raw>` 우회에 의존한다.
- ws-gateway 는 `api` 와 **별도 앱**(ADR-001)이라 이 선택은 REST(Elysia)에 영향이 없다. 인증은 JWT 가 아니라 세션 쿠키·Origin 검사이며 업그레이드 이전에 끝난다(06·04).

## 결정
**`apps/ws-gateway` 의 소켓 계층(`SocketRuntime`)을 `Bun.serve` 의 `fetch`/`websocket` 로 구현한다. `ElysiaRuntime` 은 만들지 않는다.**

## 설계 상세
- 연결 상태: `server.upgrade(req, { data })` 로 `Conn`(ActorContext 포함)을 넣고 `ws.data.conn` 으로 읽는다. 이벤트 간 같은 `ws` 객체다.
- 업그레이드 사전 검사(Origin·세션 쿠키·연결 수 제한)는 `fetch` 핸들러에서 하고, 거부는 101 이전에 401/403 이다. 세션은 엔트리포인트가 풀어 `ActorContext` 로 주입한다(ADR-052 결정 4) — 소켓 계층은 `identity` 를 호출하지 않는다.
- `/healthz`·`/readyz`·`/metrics` 는 같은 `fetch` 핸들러에서 경로 비교로 처리한다. 레이블은 고정 허용 목록(G5 `LabelPolicy`)만 쓴다.
- 백프레셔 정책은 앱 큐(64건/256KB → `4408`)가 정한다. `backpressureLimit`·`closeOnBackpressureLimit` 는 안전망으로만 최상위에 둔다(앱 큐 상한보다 큰 값, 네이티브 종료는 `1006` 만 보낸다).
- 클라이언트→서버 메시지(`hello`·`ping`)는 Elysia 의 typebox 검증이 없으므로 `@pf/protocol` 스키마로 `MessageCodec` 에서 검증한다.

## 대안과 기각 이유
- **ElysiaRuntime(`ws.raw` 어댑터)**: 비공개 내부 구조(이벤트마다 새 래퍼, `raw` 노출)에 기대 마이너 업그레이드에 취약하고, 우회가 핵심 경로(백프레셔·연결 상태)에 있다. Elysia 플러그인 이점(JWT·스키마 검증)은 이 앱에서 쓰지 않는다.
- **결정 보류(S4-2 에서 호스트 재측정과 함께)**: 비교로 얻을 새 정보가 선택을 바꿀 가능성이 낮고, 보류는 S4-2 설계를 두 갈래로 유지하는 비용을 만든다.

## 결과 (얻는 것 / 치르는 것)
- 얻는 것: 공개 API 만으로 연결 상태·버퍼 확인이 된다. 비공개 구조 의존 제거.
- 치르는 것: `/metrics` 등 부가 라우팅·요청 지표 계측을 `fetch` 안에 직접 쓴다(G5 는 Elysia 훅으로 시험했으므로 **`Bun.serve` 용 계측은 미검증**이다). 클라이언트 메시지 검증을 직접 한다. api 와 ws-gateway 가 서로 다른 HTTP 계층을 쓴다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| ws-gateway 의 지표·로깅이 api 와 어긋남 | 레이블 정책·레지스트리는 공용 패키지로 두고 프레임워크 어댑터만 앱별로 둔다. S4-2 통합 시험에서 `/metrics` 출력을 확인 |
| 이 비교가 개발 PC·loopback·합성 부하 한 곳의 결과 | 호스트 재측정(S0-2 잔여)에서 같은 시나리오를 다시 돌려 결정 영향 여부 확인 |
| 래퍼 `send` 비용은 재지 않음 | 선택과 무관하게 B 를 쓰지 않으므로 영향 없음 |

## 검증 방법
S4-2 의 04 §7.1 시퀀스 통합 시험(업그레이드 거부 401/403, 4408 종료, 하트비트)과 호스트 재측정. **성공 기준**: 소크·폭풍·격리 시나리오가 `Bun.serve` 구현으로 통과(스크립트가 판정). **재검토 조건**: 호스트 재측정에서 `Bun.serve` 구현이 기준을 못 넘거나, Elysia 가 `getBufferedAmount`·연결 상태를 공개 API 로 노출할 때.

## 실서비스라면
ws-gateway 를 별도 서비스로 확장할 때 소켓 계층이 프레임워크에 묶여 있지 않아 Go 등으로의 교체(ADR-022 대안)가 쉽다.

## 재검토 조건
위 검증 방법의 재검토 조건 외에, 관문 G2 가 호스트에서 실패할 때(Go 교체 검토).

## 관련 ADR
ADR-001 · ADR-022 · ADR-052 · ADR-050
