# ADR-035: 대국 상태 머신·서버 권위·재접속 — 이벤트 로그가 진실, 명령은 REST, push 는 NOTIFY
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04 (REST 명령 모델로 개정)
- 근거: 로드맵 Phase 1 DoD / ADR-009(판정은 서버 즉시)·014(재접속·무중단)·018(CQRS, WS push)·021(CAS·버전)·023(NOTIFY 깨우기)·025(쓰기는 tx)·032(room 채널, P0)·045(채팅 전달: WS 는 push 전용) / M1 G1·G2·G4 실측
- 구현 순서(P0 D24): Phase 1 — 6a 가 도입한 `chat` 코어·`/ws/room` 위에 대국 룸(`game:*`)을 추가한다. 선행: 6a.
- 관련 문서: [phases/01-baduk.md](../design/phases/01-baduk.md) §5, [phases/00 D8·D10](../design/phases/00-platform-evolution.md)

## 맥락
대국은 두 명이 번갈아 두고 관전자가 따라온다. 서버가 규칙·시계·승패를 권위로 판정하고, 새로고침·끊김 후 같은 상태로 돌아와야 한다. M1 의 원칙은 **WebSocket 은 서버→클라이언트 push 전용이고 쓰기는 `api` 의 REST** 다(ADR-018). 이전 안은 착수만 `/ws/room` 인바운드 예외로 받았으나, 채팅(ADR-045)과 공통 플랫폼 결정(P0 D8)이 "쓰기는 `api` 한 경로"로 정했으므로 대국도 같은 원칙으로 되돌린다. 착수 빈도는 수 초에 한 번이라 REST 왕복(M1 G1 실측: 터널 WS RTT 8/10/15ms)으로 충분하다.

## 결정 (제안)
1. **대국 상태의 진실은 DB 의 `game_event`(대국별 `seq` 추가 전용 로그)** 이다. `game` 행은 현재 국면의 스냅샷(`version`, 시계, 상태)이며 둘은 **같은 트랜잭션**에서 갱신된다(ADR-025).
2. **대국 명령(착수·패스·기권·무르기 요청/응답·사석 표시·계가 확인·재개)은 REST 로 받는다**: `POST /api/games/{id}/moves` 등. `Idempotency-Key` = `moveId`(uuid)가 곧 `game_event.move_id` 다. **`ws-gateway` 는 읽기·push 전용**이고 대국 상태를 쓰지 않는다. WS 인바운드는 룸 도메인 3종(구독 제어 `room.join`·`room.leave`, 휘발성 채팅 `typing`)과 연결 공통 `hello`·`ping`(M1 04)뿐이며 그 밖은 `room.error inbound_not_allowed` 다.
3. **순서는 행 잠금 + 명령별 조건 CAS, 경합 기준은 `seq` 가 아니라 판 버전 (3차 검토 B3·B20 정정, 2026-11-05)**: 모든 명령은 `game` 행을 `FOR UPDATE` 로 잠그고 조건을 재평가한 뒤 `UPDATE game SET … version=version+n, board_version=… WHERE id=$1 AND <명령별 조건>` 한다. 이전 안의 단일 조건 `AND version=$expected AND status='playing' AND turn=$color` 는 **차례가 아닌 쪽의 기권·무르기 수락, `scoring` 의 계가 명령을 모두 0행으로 만들었고**, `seq` 기준이라 상대의 무르기 요청·사석 표시만으로도 제시간 착수가 `version_conflict` 로 졌다. 그래서 ① `game.board_version`(국면·차례·단계를 바꿀 때만 +1, 단조)을 두고 착수·패스는 `status='playing' AND turn=$color AND board_version=$expectedBoardVersion`, 계가 명령은 `status='scoring' AND board_version=$expectedBoardVersion`, 무르기·재개 응답은 대기 요청의 `requestSeq` 일치, **기권은 `status IN ('playing','scoring')` 만**(차례·버전 무관이라 내부 재시도도 필요 없다) ② 조건 불일치는 M1 코드 **`409 version_conflict`**(`details.current`: `seq`·`boardVersion`·`status`), 이미 끝났으면 `409 game_over` ③ **`game.version` 은 마지막 `game_event.seq` 와 같다**는 규칙은 유지하고 종국 전이는 사유 행과 `finished` 행을 **같은 트랜잭션**에 써서 seq 가 +2 된다 ④ `TimeoutSweeper` 도 조회 때의 `version` 과 비교하지 않고 잠금 아래 조건(`status`·`deadline_at`)을 재평가한다. 멱등은 `Idempotency-Key`/`request_key` + `UNIQUE (game_id, move_id)`. 응답에는 생성된 `event` 를 실어 요청자가 즉시 반영하고, 뒤따르는 push 의 같은 `seq` 는 중복 제거한다. 명령별 조건 표는 [phases/01 §5.2](../design/phases/01-baduk.md).
4. **push 는 fast lane**: 명령 트랜잭션이 `pg_notify('room_changed', {room, seq})` 를 한 줄 추가하고(커밋 때 전달), 게이트웨이는 깨어나 **`RoomEventSource.after(room, lastSent)`** 로 `game_event` 를 읽어 방 구독자에게 보낸다. `RoomEventSource` 는 `realtime` 이 소유한 포트이고 `game` 이 구현한다(P0 ADR-032, 의존 역전). 읽기 모델 투영(`game_view`·로비)만 outbox 경로(비동기)다. NOTIFY 는 깨우기 신호일 뿐이며 유실 시 1초 폴링으로 보완한다(ADR-023).
5. **동기화(재접속·관전 입장)** 는 WS `room.join { room, resume? }` → `room.joined` + 스냅샷(`game` 행) 또는 `resume` 이후 `game_event` 재생. WS 가 불가하면 REST `GET /api/games/{id}`·`/events?after=` 로도 같은 결과를 얻는다.
6. **시계는 서버가 정본**: `deadline_at` 을 영속하고, 착수 시각은 `api` 가 **요청 수신 시점(`receivedAt`)에 서버 시계로 확정**한다. REST 전송 지연은 착수자 본인의 시계에 포함되고 상대 시계에 영향이 없다(상대 시계는 직전 `receivedAt` 에서 시작). push 도착 지연 보상으로 착수당 **`lagGrace` 0.3초(제안)** 를 가산하고, 시간 초과 판정 시각 `timeoutAt = deadline_at + lagGrace` 를 `TimeoutSweeper` 와 착수 경로가 같게 쓴다. 클라이언트는 `clock` push 로 보간만 한다. 시간 초과는 DB 의 `deadline_at` 으로 확정하므로 서버 재시작에도 유지된다. **`receivedAt` 은 멱등 키별 `first_received_at`** 이다 — 본 tx 와 **별도의 짧은 tx** 로 `command_receipt` 에 먼저 기록하므로, 정시에 받은 명령이 락 대기·커밋 실패로 롤백된 뒤 같은 키로 재전송돼도 처음 수신 시각으로 판정된다. **기권을 제외한 모든 플레이어 명령에 공통 시간 초과 가드**(`receivedAt > 현재 차례 deadline_at + lagGrace` 이면 명령 대신 시간 초과 전이)를 둔다 — 시간이 다 된 쪽이 무르기 수락 등으로 시계를 되살리지 못한다. **정비·장애 구간**(라이브 `api` 는 단일 인스턴스): 배포 스크립트가 `clock_freeze` 를 열고 닫으며, 계획 외 장애는 worker 가 `api` 생존 신호 단절로 감지해 같은 freeze 를 연다. freeze 동안 스윕은 선언하지 않고, 종료 뒤 진행 중 대국의 `deadline_at`·`turn_started_at` 을 정지 구간만큼 미루고 대국별 `clock_adjusted` 이벤트를 남긴다. 30분(제안)을 넘는 장애는 복구 런북이 진행 중 대국을 `abandoned` 로 일괄 종료한다(3차 검토 B4).
7. **종국은 2단계 — 기본 판정 없음 (D3, 2026-11-05 사용자 결정으로 개정)**: 연속 패스 → `scoring`(사석 표시·양측 확인) → `finished`. 양측은 서버가 표시로 계산한 **`scoreHash`**(사석·중립점 표시 + 점수 내역)에 대해 확인한다. 사석 표시가 **연속 2회 불일치**(양측이 한 번씩 낸 라운드 기준, "누적"이 아니다)하면 자동 재개되고, 어느 쪽이든 재개를 요청할 수 있으나 **상대의 수락**이 있어야 그 재개가 된다. **재개 상한(대국당 2회)은 요청·수락 재개에만 적용하고 자동 재개는 상한에서 제외**한다. 재개 후 선수는 마지막 패스한 쪽의 상대, `scoring` 중 착수 시계는 정지한다. **`scoring` 시한(제안 10분)이 지나면 기본 판정 없이 착수를 재개**한다(`scoring_timed_out` + `play_resumed`) — 이전 안의 "모든 돌 생존 영역 계가"(일본식이면 일본식 계가)는 사석 주인이 합의를 미룰수록 유리해지는 구멍이라 **규칙과 무관하게 폐기**했고, 분쟁은 실제 착수로 푼다(재개 중 시계는 흐른다). 시한 경과를 거친 대국의 종국은 레이팅 대국이면 보상에서 제외하고 감사를 남긴다. 새 돌 없는 자동 재개가 연속 3회면 `abandoned`(교착 방어, 제안). 일본식 분쟁 재개 중 자기 집 안 착수의 감점 처리는 규정서 확인 필요(ADR-034). `play_resumed`·`scoring_timed_out` 은 outbox 이벤트로도 발행하고, 접기에서 `play_resumed` 는 연속 패스 카운트를 0 으로 되돌리는 표식이며 무르기는 마지막 재개를 넘지 않는다. 기권·시간 초과는 즉시 `finished`.
7a. **시간 초과 경합(S2)**: 스윕은 `deadline_at + lagGrace + commitMargin`(7초, 제안) 뒤에만, 그리고 열린 `clock_freeze` 가 없고 `api` 생존 신호가 신선할 때만 시간 초과를 선언하고, 착수 경로·스윕 모두 `game` 행을 `FOR UPDATE` 로 잠가 조건을 재평가한다(스윕은 `version` 비교를 하지 않는다). `receivedAt ≤ deadline_at + lagGrace` 로 수신된 착수는 커밋이 늦어도 이긴다.
7b. **이탈(S3)**: `abandoned` 의 근거는 presence 가 아니라 `game` 소유 신호 — 플레이어 heartbeat(`POST /api/games/{id}/heartbeat`, 20초)로 갱신되는 `game_player.last_seen_at` 이 양측 모두 grace(5분, 제안)를 넘어 정체될 때.
7c. **무르기 (U11, 2026-11-05 사용자 결정)**: 비레이팅 대국에서만, 상대의 동의가 있어야 한다. `POST …/undo-requests` → 상대 `undo-accept`/`undo-decline`. 되돌림은 **로그를 고치지 않고 새 이벤트**(`undo_requested`·`undo_accepted`·`undo_declined`)로 남기며 상태는 이벤트를 접어(fold) 유효 수열을 만들어 되돌린다. 세 이벤트 모두 `seq`/`version` 을 +1 소비하므로 **`version == seq` 규칙이 유지되고 되돌려도 `seq` 는 증가**한다. 범위는 요청자의 마지막 착수 직전(1~2수), 차례는 요청자, 플레이어별 요청 3회·응답 30초·대기 1건(제안값)이며 대기 중 착수·패스·기권은 요청을 `superseded` 로 닫는다. **시계는 되감지 않는다** — 수락 시각에 시계가 흐르던 쪽의 경과를 착수처럼 청구(증분·`lagGrace` 없음)하고, 제거되는 수가 받은 피셔 증분은 회수(0 하한)하며, 차례는 요청자이고 `deadline_at` 은 요청자의 남은 시간으로 다시 계산한다(두 색 청구 합 = 착수 중 벽시계 시간이 보존된다, 3차 검토 B10). 수락 이벤트는 `removed`·`restored`·`captures` 를 싣고 스냅샷은 유효 수열을 실어 스냅샷으로 입장한 클라이언트도 적용할 수 있다(B11). 레이팅 대국은 불허(`undo_not_allowed`)라 보상 자격·KataGo 분석 입력에 영향이 없고, 방어적으로 `game.finished.undoCount = 0` 을 자격 조건에 둔다. 재접속·관전자는 같은 접기 결과를 받는다. 상세 [phases/01 §4.5](../design/phases/01-baduk.md).
7d. **플레이어는 로그인 필수 (U21, 2026-11-05 사용자 결정 — 권장안은 익명 비레이팅 허용이었다)**: 레이팅·비레이팅 모두 GitHub 로그인 사용자만 플레이어가 된다(도전 개설·수락·모든 대국 명령 REST 는 가드 `RequireUser`, 익명은 `403 login_required`). **익명 세션은 관전만** 한다(`/ws/room` `room.join` 으로 공개 대국 관전 구독, `/ws/private` 은 자기 흐름 전용). 익명 비레이팅 대국은 폐지한다. 남은 모더레이션 우회 위험은 관전자 익명(세션 재발급으로 뮤트 회피)이며 채팅 정책은 P4 가 정본이다.
8. 대국 상태 전이는 `Ruleset` 전략과 분리된 **도메인 서비스**가 판정한다(순수, 시계·난수는 포트).

## 설계 상세
상태 머신, REST 계약, WS 메시지, 시퀀스, 시계 공정성, 지연 예산은 [phases/01-baduk.md](../design/phases/01-baduk.md) §4~5 가 정본이다. 이 ADR 은 선택의 이유만 남긴다.

**지연 예산**: 착수자 클릭 → 상대 화면 push 도착 p95 ≤ 250ms(P0 D10, 제안·미측정). 구간 추정은 터널 편도 5–15ms(폐기된 Cloudflare 임시 터널 G1 측정의 절반 — **Funnel 에는 적용되지 않으므로 G14 에서 재측정**), api 처리 10–25ms(추정), NOTIFY 도착 p50 0.31/p99 8–17ms(G4 측정), 팬아웃 p50 2.6–3.7/p99 7–65ms(G2 소크 측정)로 합 40–140ms(추정). 표준 경로(outbox→inbox→broadcaster→room_log)를 타면 +30–100ms(추정)라 예산 근처이므로 대국 룸은 fast lane 을 기본으로 한다. Phase 1 부하 시험에서 표준 경로가 p95 150ms 이하로 측정되면 제거할 수 있다.

## 대안과 기각 이유
- **착수를 WS 인바운드로 받기(이전 안)**: 왕복은 약간 짧지만 `ws-gateway` 에 DB 쓰기와 명령 usecase 를 들여 M1 의 읽기 전용 모델을 깨고, 쓰기 경로가 둘이 되어 가드 체인(Origin·속도 제한·멱등)·감사·배포 격리를 중복 구현해야 한다. 착수 빈도가 낮아 이득이 없다. → 기각, 지연 예산 초과가 측정되면 재검토(재검토 조건).
- **프로세스 메모리의 단일 작성자(actor)가 상태 보유**: 재시작·수평 확장에서 상태가 사라지고 ADR-014 "상태는 프로세스 메모리에 두지 않는다"에 어긋난다.
- **Redis 에 대국 상태**: ADR-021 이 선점은 정본 DB 안에서 한다고 정했다. 이 규모에서 지연 이득이 불필요하다.
- **착수마다 outbox → inbox → broadcaster → `room_log` 경유**: 4~5 홉이 추가돼 예산 여유가 작다(위 추정). 대국 룸에 한해 fast lane 을 쓰고 채팅은 표준 경로를 쓴다.
- **명령이 `realtime.AppendRoomLog` 를 호출(P0 §6.7 의 fast lane 예외)**: `game_event` 가 이미 방 로그이므로 같은 내용을 한 번 더 쓰고 경계 규칙 예외가 늘어난다. `RoomEventSource` 포트로 대체하며 `AppendRoomLog` 는 **미사용 예약**이다(쓰게 되면 `AppendRoomLogInTx` 로 개명하고 허용 쌍 #11 을 ADR-030 개정과 함께 추가).
- **무르기를 `move_played` 행 삭제/갱신으로 구현**: 로그가 추가 전용이고 `seq` 가 단조 증가해야 재생·동기화·`version == seq` 가 성립한다. 삭제는 구독자가 이미 받은 이벤트와 어긋난다. → 기각, 새 이벤트 + 접기.
- **일방 무르기(상대 동의 없음) / 레이팅 대국도 무르기 허용**: 일방은 시간 끌기·분석 회피 수단이 되고, 레이팅 대국은 보상·분석 신뢰성을 약하게 한다. → 기각(비레이팅 + 상대 동의).
- **익명 비레이팅 대국 허용(Claude 권장안)**: 진입 장벽은 낮으나 뮤트·신고 우회가 대국 경로까지 넓어진다. 사용자가 로그인 필수로 변경해 기각.
- **고정 지연 보상 없음 / RTT 기반 가변 보상**: 전자는 느린 회선이 구조적으로 불리, 후자는 RTT 측정 신뢰도·REST 전용 클라이언트 적용 문제로 후속(측정 후).

## 결과
- 얻는 것: 쓰기 경로가 `api` 하나로 통일(가드·멱등·감사 재사용), `ws-gateway` 는 M1 과 같이 읽기·push 전용이라 격리와 배포가 단순, 재시작·재접속에 강한 상태, 낮은 push 지연.
- 치르는 것: 착수가 REST 왕복이라 WS 인바운드보다 요청 헤더 비용이 있고, 시계 공정성을 위해 `receivedAt`·`lagGrace` 규칙이 필요하며, `RoomEventSource` 포트와 `room_changed` NOTIFY 채널이 추가된다. `game_event` 보관·정리 규칙이 필요하다. 쓰기 스키마 `game_event` 를 `ws-gateway`·`SyncGame`·`GET …/events` 가 읽는 것은 CQRS 의 **문서화된 예외 X1** 이다(방 로그이므로 복제하지 않음, P0 §2.4 등재).

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 핫 행(`game`) 경합 | 대국당 두 명뿐이라 경합은 착수·시간초과·기권 간뿐, CAS 로 해결 |
| 시계 조작·지연 | 서버 시계 정본, 클라이언트 시각 불신, `receivedAt` 기준, `lagGrace` 고정 상한(착수당 0.3초) |
| REST 지연으로 체감 불량 | `T_click→peer`·`T_commit→push` 측정, 초과 시 원인 분리(Funnel/api/게이트웨이), 그래도 부족하면 WS 인바운드 재검토 |
| 요청 폭주 | 세션 속도 제한 `write.game`(초당 5건), 가드 체인 재사용 |
| 무르기 남용(반복 요청·시간 끌기) | 비레이팅만, 플레이어별 3회, 대기 1건·30초, 시계 되감지 않음 |
| 접기 결과와 스냅샷 불일치 | `positionHash`(16진 문자열, 엔진 버전 스냅샷) 검증, 재생 동등성 시험(AC-BD-22), 재개 수열 접기 속성 시험(AC-BD-30) |
| 차례와 무관한 이벤트로 제시간 착수가 짐 | 판 버전 CAS, `first_received_at` 별도 tx, 공통 시간 초과 가드(AC-BD-25~27) |
| 단일 `api` 재배포·장애 중 시계 진행 | `clock_freeze` + `clock_adjusted` 보정, 생존 신호 단절 감지, 장기 장애 런북(AC-BD-28) |
| 계가 분쟁 지연으로 이득 | 기본 판정 폐기 → 시한 경과 시 착수 재개, 시한 경과 종국은 레이팅 보상 제외(AC-BD-08) |
| 이중 접속(두 탭) | 같은 참가자의 여러 탭 허용, 착수는 CAS/멱등으로 한 번만 |
| NOTIFY 유실 | 구독 방 1초 폴링, 순번으로 정확성 보장 |

## 검증 방법
무르기 경합(요청·수락·만료·착수)과 재생 동등성(AC-BD-21~23), 익명 가드(AC-BD-24), 동시 착수·시간초과 경합·재시작·끊김 카오스 시험(phases/01 §15), 재생 동등성(이벤트 재생 결과 = 스냅샷), `lagGrace` 경계 속성 시험, 게이트웨이 인바운드 거절 시험(AC-BD-16), push 지연 p95 측정(AC-BD-17), 판 버전·재전송·공통 가드 결정적 시험(AC-BD-25~27), `clock_freeze` 보정(AC-BD-28), 무르기 전후 총 경과 시간 보존·재개 수열 접기 속성 시험(AC-BD-29·30 — 설계 단계에서 보드 없는 모형으로 20,000 무작위 열을 돌려 성립을 확인, phases/01 §4.5).

## 실서비스라면
대국 서버를 방(룸) 단위 샤딩으로 분리하고 이벤트 소싱을 Kafka 계열 로그로 확장, 부정행위 탐지는 별도 파이프라인으로 둔다. 초단위 이하 실시간 입력이 필요하면 전용 실시간 서버로 명령을 받는다.

## 재검토 조건
`T_click→peer` p95 가 250ms 를 넘고 원인이 REST 왕복으로 확인될 때(WS 명령 도입 재검토). 동시 대국 수나 지연 목표가 CAS/NOTIFY 구조로 안 맞을 때. 핫 행 경합 지표가 높을 때. fast lane 제거 조건(표준 경로 p95 ≤ 150ms)이 측정될 때.

## 관련 ADR
ADR-009, ADR-014, ADR-018, ADR-021, ADR-023, ADR-025, ADR-032, ADR-034, ADR-036, ADR-037, ADR-045
