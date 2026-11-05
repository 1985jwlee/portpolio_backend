# ADR-035: 대국 상태 머신·서버 권위·재접속 — 이벤트 로그가 진실, 명령은 REST, push 는 NOTIFY
- 상태: **Proposed** (사용자 확정 대기)
- 날짜: 2026-11-04 (REST 명령 모델로 개정)
- 근거: 로드맵 Phase 1 DoD / ADR-009(판정은 서버 즉시)·014(재접속·무중단)·018(CQRS, WS push)·021(CAS·버전)·023(NOTIFY 깨우기)·025(쓰기는 tx)·032(room 채널, P0)·045(채팅 전달: WS 는 push 전용) / M1 G1·G2·G4 실측
- 구현 순서(P0 D24): Phase 1 — 6a 가 도입한 `chat` 코어·`/ws/room` 위에 대국 룸(`game:*`)을 추가한다. 선행: 6a.
- 관련 문서: [phases/01-baduk.md](../design/phases/01-baduk.md) §5, [phases/00 D8·D10](../design/phases/00-platform-evolution.md)

## 맥락
대국은 두 명이 번갈아 두고 관전자가 따라온다. 서버가 규칙·시계·승패를 권위로 판정하고, 새로고침·끊김 후 같은 상태로 돌아와야 한다. M1 의 원칙은 **WebSocket 은 서버→클라이언트 push 전용이고 쓰기는 `api` 의 REST** 다(ADR-018). 이전 안은 착수만 `/ws/room` 인바운드 예외로 받았으나, 채팅(ADR-045)과 공통 플랫폼 결정(P0 D8)이 "쓰기는 `api` 한 경로"로 정했으므로 대국도 같은 원칙으로 되돌린다. 착수 빈도는 수 초에 한 번이라 REST 왕복(M1 G1 실측: 터널 WS RTT 8/10/15ms)으로 충분하다.

## 결정 (제안)
1. **대국 상태의 진실은 DB 의 `game_event`(대국별 `seq` 추가 전용 로그)** 이다. `game` 행은 현재 국면의 스냅샷(`version`, 시계, 상태)이며 둘은 **같은 트랜잭션**에서 갱신된다(ADR-025).
2. **대국 명령(착수·패스·기권·사석 표시·계가 확인·재개)은 REST 로 받는다**: `POST /api/games/{id}/moves` 등. `Idempotency-Key` = `moveId`(uuid)가 곧 `game_event.move_id` 다. **`ws-gateway` 는 읽기·push 전용**이고 대국 상태를 쓰지 않는다. WS 인바운드는 구독 제어(`room.join`·`room.leave`)·`ping`·휘발성 신호(채팅 `typing`)뿐이며 그 밖은 `room.error inbound_not_allowed` 다.
3. **순서는 CAS**: `UPDATE game SET … version=version+1 WHERE id=$1 AND version=$expected AND status='playing' AND turn=$color`. 0행이면 M1 코드 **`409 version_conflict`**(`expectedVersion`·`details.current`)로 거절하고(대국이 이미 끝났으면 `409 game_over`) 클라이언트는 재동기화한다. 모든 대국 명령이 `expectedVersion`(= 마지막으로 본 `seq` = `game.version`)을 싣고, `game.version` 은 마지막 `game_event.seq` 와 같으며 종국 전이는 사유 행과 `finished` 행을 **같은 트랜잭션**에 써서 seq 가 +2 된다. 기권은 상태 무관한 의사 표시라 서버가 최대 2회 내부 재시도한다. 멱등은 `Idempotency-Key`/`request_key` + `UNIQUE (game_id, move_id)`. 응답에는 생성된 `event` 를 실어 요청자가 즉시 반영하고, 뒤따르는 push 의 같은 `seq` 는 중복 제거한다.
4. **push 는 fast lane**: 명령 트랜잭션이 `pg_notify('room_changed', {room, seq})` 를 한 줄 추가하고(커밋 때 전달), 게이트웨이는 깨어나 **`RoomEventSource.after(room, lastSent)`** 로 `game_event` 를 읽어 방 구독자에게 보낸다. `RoomEventSource` 는 `realtime` 이 소유한 포트이고 `game` 이 구현한다(P0 ADR-032, 의존 역전). 읽기 모델 투영(`game_view`·로비)만 outbox 경로(비동기)다. NOTIFY 는 깨우기 신호일 뿐이며 유실 시 1초 폴링으로 보완한다(ADR-023).
5. **동기화(재접속·관전 입장)** 는 WS `room.join { room, resume? }` → `room.joined` + 스냅샷(`game` 행) 또는 `resume` 이후 `game_event` 재생. WS 가 불가하면 REST `GET /api/games/{id}`·`/events?after=` 로도 같은 결과를 얻는다.
6. **시계는 서버가 정본**: `deadline_at` 을 영속하고, 착수 시각은 `api` 가 **요청 수신 시점(`receivedAt`)에 서버 시계로 확정**한다. REST 전송 지연은 착수자 본인의 시계에 포함되고 상대 시계에 영향이 없다(상대 시계는 직전 `receivedAt` 에서 시작). push 도착 지연 보상으로 착수당 **`lagGrace` 0.3초(제안)** 를 가산하고, 시간 초과 판정 시각 `timeoutAt = deadline_at + lagGrace` 를 `TimeoutSweeper` 와 착수 경로가 같게 쓴다. 클라이언트는 `clock` push 로 보간만 한다. 시간 초과는 DB 의 `deadline_at` 으로 확정하므로 서버 재시작에도 유지된다.
7. **종국은 2단계**: 연속 패스 → `scoring`(사석 표시·양측 확인) → `finished`. 사석 표시가 **2회 연속 불일치**하면 자동 재개되고, 어느 쪽이든 재개를 요청할 수 있으나 **상대의 수락**이 있어야 재개된다(일방 재개 불가). 재개는 대국당 **최대 2회**, 재개 후 선수는 마지막 패스한 쪽의 상대, `scoring` 중 착수 시계는 정지한다. `scoring` 시한(제안 10분)이 지나면 엔진 기본 판정(모든 돌 생존, 영역 계가)으로 종국한다. 기권·시간 초과는 즉시 `finished`.
7a. **시간 초과 경합(S2)**: 스윕은 `deadline_at + lagGrace + commitMargin`(7초, 제안) 뒤에만 시간 초과를 선언하고, 착수 경로·스윕 모두 `game` 행을 `FOR UPDATE` 로 잠가 재검사한다. `receivedAt ≤ deadline_at + lagGrace` 로 수신된 착수는 커밋이 늦어도 이긴다.
7b. **이탈(S3)**: `abandoned` 의 근거는 presence 가 아니라 `game` 소유 신호 — 플레이어 heartbeat(`POST /api/games/{id}/heartbeat`, 20초)로 갱신되는 `game_player.last_seen_at` 이 양측 모두 grace(5분, 제안)를 넘어 정체될 때.
8. 대국 상태 전이는 `Ruleset` 전략과 분리된 **도메인 서비스**가 판정한다(순수, 시계·난수는 포트).

## 설계 상세
상태 머신, REST 계약, WS 메시지, 시퀀스, 시계 공정성, 지연 예산은 [phases/01-baduk.md](../design/phases/01-baduk.md) §4~5 가 정본이다. 이 ADR 은 선택의 이유만 남긴다.

**지연 예산**: 착수자 클릭 → 상대 화면 push 도착 p95 ≤ 250ms(P0 D10, 제안·미측정). 구간 추정은 터널 편도 5–15ms(G1 측정의 절반), api 처리 10–25ms(추정), NOTIFY 도착 p50 0.31/p99 8–17ms(G4 측정), 팬아웃 p50 2.6–3.7/p99 7–65ms(G2 소크 측정)로 합 40–140ms(추정). 표준 경로(outbox→inbox→broadcaster→room_log)를 타면 +30–100ms(추정)라 예산 근처이므로 대국 룸은 fast lane 을 기본으로 한다. Phase 1 부하 시험에서 표준 경로가 p95 150ms 이하로 측정되면 제거할 수 있다.

## 대안과 기각 이유
- **착수를 WS 인바운드로 받기(이전 안)**: 왕복은 약간 짧지만 `ws-gateway` 에 DB 쓰기와 명령 usecase 를 들여 M1 의 읽기 전용 모델을 깨고, 쓰기 경로가 둘이 되어 가드 체인(Origin·속도 제한·멱등)·감사·배포 격리를 중복 구현해야 한다. 착수 빈도가 낮아 이득이 없다. → 기각, 지연 예산 초과가 측정되면 재검토(재검토 조건).
- **프로세스 메모리의 단일 작성자(actor)가 상태 보유**: 재시작·수평 확장에서 상태가 사라지고 ADR-014 "상태는 프로세스 메모리에 두지 않는다"에 어긋난다.
- **Redis 에 대국 상태**: ADR-021 이 선점은 정본 DB 안에서 한다고 정했다. 이 규모에서 지연 이득이 불필요하다.
- **착수마다 outbox → inbox → broadcaster → `room_log` 경유**: 4~5 홉이 추가돼 예산 여유가 작다(위 추정). 대국 룸에 한해 fast lane 을 쓰고 채팅은 표준 경로를 쓴다.
- **명령이 `realtime.AppendRoomLog` 를 호출(P0 §6.7 의 fast lane 예외)**: `game_event` 가 이미 방 로그이므로 같은 내용을 한 번 더 쓰고 경계 규칙 예외가 늘어난다. `RoomEventSource` 포트로 대체하며 `AppendRoomLog` 는 **미사용 예약**이다(쓰게 되면 `AppendRoomLogInTx` 로 개명하고 허용 쌍 #11 을 ADR-030 개정과 함께 추가).
- **고정 지연 보상 없음 / RTT 기반 가변 보상**: 전자는 느린 회선이 구조적으로 불리, 후자는 RTT 측정 신뢰도·REST 전용 클라이언트 적용 문제로 후속(측정 후).

## 결과
- 얻는 것: 쓰기 경로가 `api` 하나로 통일(가드·멱등·감사 재사용), `ws-gateway` 는 M1 과 같이 읽기·push 전용이라 격리와 배포가 단순, 재시작·재접속에 강한 상태, 낮은 push 지연.
- 치르는 것: 착수가 REST 왕복이라 WS 인바운드보다 요청 헤더 비용이 있고, 시계 공정성을 위해 `receivedAt`·`lagGrace` 규칙이 필요하며, `RoomEventSource` 포트와 `room_changed` NOTIFY 채널이 추가된다. `game_event` 보관·정리 규칙이 필요하다. 쓰기 스키마 `game_event` 를 `ws-gateway`·`SyncGame`·`GET …/events` 가 읽는 것은 CQRS 의 **문서화된 예외 E1** 이다(방 로그이므로 복제하지 않음, P0 §2.4 등재).

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 핫 행(`game`) 경합 | 대국당 두 명뿐이라 경합은 착수·시간초과·기권 간뿐, CAS 로 해결 |
| 시계 조작·지연 | 서버 시계 정본, 클라이언트 시각 불신, `receivedAt` 기준, `lagGrace` 고정 상한(착수당 0.3초) |
| REST 지연으로 체감 불량 | `T_click→peer`·`T_commit→push` 측정, 초과 시 원인 분리(터널/api/게이트웨이), 그래도 부족하면 WS 인바운드 재검토 |
| 요청 폭주 | 세션 속도 제한 `write.game`(초당 5건), 가드 체인 재사용 |
| 이중 접속(두 탭) | 같은 참가자의 여러 탭 허용, 착수는 CAS/멱등으로 한 번만 |
| NOTIFY 유실 | 구독 방 1초 폴링, 순번으로 정확성 보장 |

## 검증 방법
동시 착수·시간초과 경합·재시작·끊김 카오스 시험(phases/01 §15), 재생 동등성(이벤트 재생 결과 = 스냅샷), `lagGrace` 경계 속성 시험, 게이트웨이 인바운드 거절 시험(AC-BD-16), push 지연 p95 측정(AC-BD-17).

## 실서비스라면
대국 서버를 방(룸) 단위 샤딩으로 분리하고 이벤트 소싱을 Kafka 계열 로그로 확장, 부정행위 탐지는 별도 파이프라인으로 둔다. 초단위 이하 실시간 입력이 필요하면 전용 실시간 서버로 명령을 받는다.

## 재검토 조건
`T_click→peer` p95 가 250ms 를 넘고 원인이 REST 왕복으로 확인될 때(WS 명령 도입 재검토). 동시 대국 수나 지연 목표가 CAS/NOTIFY 구조로 안 맞을 때. 핫 행 경합 지표가 높을 때. fast lane 제거 조건(표준 경로 p95 ≤ 150ms)이 측정될 때.

## 관련 ADR
ADR-009, ADR-014, ADR-018, ADR-021, ADR-023, ADR-025, ADR-032, ADR-034, ADR-036, ADR-037, ADR-045
