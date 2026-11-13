# ADR-006: 이벤트 전달 계층 — Postgres 폴링에서 Redis Streams 또는 Kafka 로
- 상태: **Superseded by [ADR-031](ADR-031-event-transport-streams.md)** (2026-11-05 정리). 아래 "결정 (잠정)" 3항은 모두 ADR-031 이 이어받거나 바꿨다: 1항(M1 은 Postgres outbox·폴링, 전달 인터페이스 뒤) → 031 결정 1·2 로 유지, 2항(Phase 3 부하 시험으로 판정) → 031 결정 3, 3항(Redis Streams 우선 검토) → 031 은 **기본 Postgres, Streams 는 합격선 충족 시 소비자 단위 채택**으로 뒤집었고 Kafka 는 기각(결정 5). 본문은 당시 기록으로 보존한다. (원 상태: Proposed — 사용자 지시 "Kafka 의 메모리 부족을 Redis 와 함께 Redis Streams 로 푸는 방안을 검토")
- 날짜: 2026-11-03
- 근거: 원 계획안 모순 #6, Phase 3 / 명세 Out of Scope, FR-030 / 인터뷰 R6-Q1, R9-Q1

> 도입 이음새·기준·장애 거동은 [ADR-024](ADR-024-redis-seam.md). 이 ADR 의 전달 인터페이스가 그곳의 `EventTransport` 포트다.

## 맥락
- 명세 M1 은 브로커 없이 Postgres outbox 폴링/NOTIFY 를 쓴다(근거: 무료 자원에서 메모리 최소).
- 원 계획안은 Outbox → Kafka → 멱등 Consumer 이고, KataGo 워커 토픽(`game.review.requested`)과 타임딜 차감이 이를 쓴다.
- 원 계획안 Phase 3 는 **Redis 를 이미 요구**한다(Lua 원자 재고 선점). 즉 Redis 는 어차피 스택에 들어온다.
- 사용자의 우려: **Kafka 는 무료 호스팅의 메모리 한도에서 부담이 클 수 있다.**

## 결정 (잠정)
1. **M1**: Postgres outbox + 폴링/NOTIFY. 발행·소비는 **전달 인터페이스 뒤**에 둔다. ADR-005 규약(at-least-once + 멱등)은 유지한다.
2. **타임딜(Phase 3) 시점**에 아래 비교를 `deal` 버스트 부하 시험으로 측정해 판정하고([ADR-031](ADR-031-event-transport-streams.md)) 이 ADR 을 Accepted 로 확정하거나 후속 ADR 로 대체한다.
3. 비교 전 기본 방향은 **Redis Streams 우선 검토**다(추가 컨테이너가 없다).

## 설계 상세

### 전달 인터페이스(개념)
- 발행: outbox 의 이벤트를 전달 계층에 넣는다. 반환은 "전달 계층이 받았다"까지다.
- 구독: 전달 계층은 구독 모듈의 **`ReceiveMessage` usecase** 만 호출한다. 이 usecase 는 메시지를 **inbox 에 저장하고 ack** 한다(ADR-020).
- 처리(효과 적용)는 inbox 에서 선점해서 하므로 **전달 계층이 Postgres 폴링이든 Redis Streams 든 Kafka 든 소비자 코드와 inbox 는 바뀌지 않는다.** 정확히 한 번 효과는 inbox 가 책임지고, 전달 계층은 최소 한 번 전달만 맡는다.

### Redis Streams 로 갈 경우의 구성(검토안)
| 필요 | Streams 기능 |
|---|---|
| 토픽 | 스트림(종류별 키) |
| 소비자 그룹 | 그룹별 읽기·분배 |
| 전달 보장 | 확인(ack) 전까지 pending 으로 남음 |
| 놓친 메시지 복구 | pending 항목을 다른 소비자가 인수(claim) |
| 크기 제한 | 길이 상한으로 잘라냄 |
| 내구성 | AOF/RDB 설정에 의존 |

### 비교 후보
| 항목 | Postgres 폴링 | Redis Streams | Kafka | NATS JetStream |
|---|---|---|---|---|
| 추가 컨테이너 | 없음 | 없음(Redis 가 이미 있다고 전제) | 있음 | 있음 |
| 메모리 | 측정 예정 | 측정 예정 | 측정 예정 | 측정 예정 |
| 전달 보장 | DB 가 보장 | ack/pending | 오프셋/그룹 | ack |
| 내구성 | DB 수준 | **설정 의존, 유실 가능성** | 로그 보존 | 설정 의존 |
| 순서 | 대상별 | 스트림 내 | 파티션 내 | 스트림 내 |
| 증명 가치 | 낮음 | 중간 | 높음(업계 표준) | 낮음 |
| 이 저장소의 지식 | 있음 | 스킬 있음 | 스킬 있음 | 없음 |

### 결정 기준
- **메모리**: 같은 부하에서 컨테이너 상주 메모리를 측정해 무료 자원 한도와 대조.
- **내구성**: Redis 재시작·유실 시나리오에서 이벤트 유실 여부. ADR-010 의 "Redis 유실" 시험과 같은 시험을 공유한다.
- **복구**: 소비자 비정상 종료 후 pending 이 정상 복구되는가.
- **서사**: 원 계획안은 Kafka 를 쓰되 "실서비스라면 이렇게 줄인다"를 기록하라고 했다. Redis Streams 선택은 그 서사에 더 맞을 수 있다.

## 대안
- **끝까지 Postgres 폴링**: 가장 단순하나 토픽·멱등 Consumer 설계를 크게 다시 써야 한다.
- **처음부터 Kafka**: 원 계획안 그대로이나 무료 자원 메모리 부담.
- **NATS JetStream**: 가볍지만 이 저장소에 경험·스킬이 없다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| Redis 가 재고 선점과 전달을 함께 맡아 **장애 영역이 공유**됨 | 인스턴스 분리 검토, 내구성 설정 시험 |
| 측정 없이 취향으로 정하게 됨 | 위 기준표를 채우기 전에는 Accepted 로 올리지 않는다 |

## 실서비스라면
이벤트 규모가 작으면 Redis Streams 또는 DB outbox 로 충분하고, 팀 간 재사용·장기 보존이 필요해질 때 Kafka 를 도입한다.

## 재검토 조건
위 측정 완료 시점(타임딜 Phase 3, ADR-031). 순서·내구성 요구가 Redis 로 충족되지 않으면 Kafka.

## 관련 ADR
ADR-005, ADR-009, ADR-010, ADR-002(메모리 예산)
