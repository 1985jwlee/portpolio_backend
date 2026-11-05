# ADR-032: 룸 실시간 채널 — `/ws/room` 세 번째 연결, push 전용, 도메인이 정책을 등록
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04
- 근거: 사용자 결정(public/private 분리 연결) / ADR-018(CQRS, WS push) / ADR-014(재접속) / M1 04·F14 / M1 G1·G2 실측
- 관련 문서: [phases/00 §6](../design/phases/00-platform-evolution.md), [design/04](../design/04-ws-protocol.md)

## 맥락
바둑·채팅은 "특정 룸 참가자·관전자에게만" 가는 메시지가 필요하다. M1 의 `/ws/public`(모두 동일)과 `/ws/private`(세션 소유자 전용)로는 표현할 수 없다.

## 결정
0. **도입 시점(구현 순서 D24)**: `/ws/room` 의 **첫 사용처는 6a(CS 채팅)** 이고 대국 룸(`game:*`)은 Phase 1(바둑, 구현 순서 마지막)에서 같은 연결에 추가된다. Phase 3~5 는 `/ws/public`·`/ws/private` 만 쓴다.
1. **세 번째 연결 `/ws/room`** 을 추가한다. 세션 필수(익명은 **관전자만**, U21 — 대국 플레이어는 로그인 필수; 익명 연결은 역할별 슬롯 상한으로 로그인 연결과 분리, features/14 RT-15), 한 연결에 여러 룸을 `room.join` 으로 구독한다(연결당 최대 8, 제안). 룸 키는 `<type>:<uuid>`(`game:`·`chat:`·`cs:`), 구독 속도는 초당 5회(초과 시 `4429`, 정본 값).
2. **WebSocket 은 push 전용을 유지한다.** 쓰기(착수·채팅·신고)는 멱등 키가 있는 REST 이고 결과가 룸 채널로 push 된다(ADR-018). 인바운드 허용은 룸 도메인 **3종**(`room.join`·`room.leave`·휘발성 `typing`)과 연결 공통 `hello`·`ping`(합 5개)뿐이다.
3. 룸 순번·재개: **도메인이 자체 순번 로그를 가진 룸**은 그 순번이 방 순번이다 — (a) 대국은 `game_event`(push 는 fast lane `room_changed`), (b) 채팅은 `chat` 메시지 표(명령 쪽 방 카운터, ADR-045; push 는 표준 경로 outbox → chat-broadcaster → NOTIFY). 둘 다 재생은 `RoomEventSource` 이고 `room_log` 에는 쓰지 않는다. **`room_log (room_key, seq)` + `room_seq`**(M1 `change_log` 의 일반화)는 **자체 로그가 없는 룸 종류용 예약**(현재 해당 없음)이다. 이력이 없으면 **도메인이 만든 스냅샷**으로 복구한다(정본은 도메인 표).
4. **`realtime` 모듈이 포트를 소유**한다: `RoomAccessPolicy`, `RoomSnapshotProvider`, `RoomMessageMapper`, `RoomEventSource`(도메인이 자체 순번 로그를 가진 룸의 재생·원천). 도메인 모듈이 `GameRoomPolicy`(game)·`ChatRoomPolicy`(chat)·`CsRoomPolicy`(support) 구현을 `apps/ws-gateway/compose` 에서 등록한다(포트를 도메인이 정의하거나 game 이 chat 을 임포트하는 구성은 쓰지 않는다) → `realtime` 은 도메인에 의존하지 않는다.
5. 룸 이벤트 지연 예산은 **p95 ≤ 250ms(제안, 미측정)**. 자체 순번 로그가 있는 룸(대국)은 **명령 tx 의 `NOTIFY room_changed` + `RoomEventSource`** 를 기본 fast lane 으로 쓴다(경계 규칙 예외 없음). 로그 없는 룸이 예산을 넘길 때의 2차 대응 `realtime.AppendRoomLogInTx` 는 **미사용 예약**이다 — 쓰려면 ADR-030 개정으로 허용 쌍 #11 을 먼저 추가해야 한다(경계 규칙 R4).

## 설계 상세
**presence 는 `realtime` 이 소유**한다(P0 D19, `PresenceCounter` 포트; 도메인은 읽기 포트 `GetRoomPresence`·`IsParticipantConnected` 로 조회만). 프로토콜 확장(`ch:'room'`, `rm`, `room.join/room.leave`, `room.joined/snapshot/closed/error`, `replay.end`, 휘발성 `room.presence/typing`), 권한 판정 시퀀스, 클래스 구조, 연결·팬아웃·백프레셔 한도는 phases/00 §6. 총 연결 상한 `WS_MAX_CONNECTIONS` 400(제안).

## 대안과 기각 이유
| 안 | 이유 |
|---|---|
| `/ws/private` 에 다중화 | private 의 단순성(재개 없음)을 해치고 룸 폭주가 개인 흐름을 지연시킨다 |
| 룸마다 연결 | 연결 폭증 |
| 모두 한 소켓 | 사용자 결정(public/private 분리)과 충돌 |
| WS 로 착수 전송 | CQRS·멱등·outbox 규약을 우회. 착수 빈도(초 단위)에 REST 로 충분 — 지연 예산 초과 시 재검토 |

## 결과
- 얻는 것: 기존 채널 불변, 룸 장애 격리, 도메인 확장이 포트 등록만으로 가능.
- 치르는 것: 탭당 소켓 최대 3개, `room_log`/카운터 정리 잡, 정책 포트 구현.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 룸 이벤트 지연 | 지연 예산 측정, fast lane |
| 권한 상실 후에도 수신 | `RoomAccessPolicy` 재판정 + `room.closed` |
| 룸별 카운터 행 누적 | 룸 종료 + 1시간 후 정리 규칙 |

## 검증 방법
룸 재접속·권한·역할별 변환 시험(08 §6 확장), 대국 룸 부하(연결 400)에서 메모리·지연 측정.

## 재검토 조건
지연 예산 초과, 룸당 구독자 수가 상한을 넘는 요구, WS 로 명령을 받아야 하는 요구(예: 초단위 이하 실시간 입력).

## 관련 ADR
ADR-003, ADR-014, ADR-018, ADR-022, ADR-030
