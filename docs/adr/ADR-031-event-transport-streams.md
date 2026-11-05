# ADR-031: 이벤트 전달 계층 — Postgres 정본 유지, Redis Streams 는 소비자 단위로 Phase 3 에서 판정
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1). ADR-006 을 대체한다(ADR-006 자체의 상태 갱신은 별도)
- 날짜: 2026-11-04
- 근거: ADR-006(Proposed) / ADR-024(Redis 이음새) / ADR-010(Redis 는 파생) / 사용자 지시("Kafka 의 메모리 부족을 Redis Streams 로 푸는 방안 검토")
- 관련 문서: [phases/00 §4~5](../design/phases/00-platform-evolution.md)

## 맥락
ADR-006 은 "Phase 2 착수 전 측정"을 요구했다. 그러나 Phase 2 의 소비자(KataGo 분석)는 DB 선점 큐로 충분하고, Redis 가 실제로 필요한 것은 Phase 3(재고 Lua)이며 전달 계층이 부하를 받는 지점도 타임딜 버스트다. Streams 는 내구성이 설정에 의존(AOF `everysec` 시 최대 약 1초분 유실 가능 — 공식 문서 기준 기억, 구현 시 재확인)하므로 정본이 될 수 없다.

## 결정
1. **정본은 Postgres outbox + inbox.** 모든 이벤트는 같은 트랜잭션으로 outbox 에 먼저 기록된다(ADR-005).
2. **`EventTransport` 어댑터는 소비자 단위로 고른다**(`transport: postgres | streams`, 기본 `postgres`). 같은 이벤트가 소비자마다 다른 경로를 탈 수 있다.
3. **Streams 채택 판정을 Phase 3 의 `deal` 버스트 부하 시험으로 옮긴다.** Phase 1~2 는 Postgres 만 쓴다.
4. 채택 시 **`TransportReconciler`** 로 Redis 유실을 복구한다(outbox 가 정본). Streams 는 **측정 합격선 미달일 때만** 채택하고 기본은 Postgres 폴링이다(U9 확정 2026-11-05). 합격 기준 미충족이면 Postgres 를 유지하고 Streams 어댑터는 포트 뒤에 남긴다.
5. **Kafka 는 기각**(재검토 조건 phases/00 §4.7).
6. **Redis 는 Phase 3 에 단일 인스턴스 1개**로 도입한다(키 접두사 `pf:stock:`·`pf:evt:`·`pf:rl:` 로 용도 분리, `noeviction`, 비스트림 키 전부 TTL). `redis-stock`/`redis-stream` 컨테이너·접속 분리는 장애 영역 분리 트리거가 측정될 때 **Phase 4** 에서 재평가한다(P0 D6).
7. Phase 2 의 분석 큐는 Postgres inbox 선점이다. 큐 작업 생성은 ledger 의 `reward.pending_created` 소비로 한다(P0 D23·§8.3).

## 설계 상세
스트림 키 `pf:evt:<module>`, 소비자 그룹 = inbox 소비자 이름, 수신은 `XREADGROUP`→`ReceiveMessage`(inbox 저장)→`XACK`, 회수 `XAUTOCLAIM`(유휴 60초 제안), 트림 `MAXLEN ~ 50,000`(제안), 역압은 고수위에서 `XADD` 중지(outbox 가 버퍼). 무중단 전환은 그림자 발행 → 소비자 단위 전환 → 롤백은 설정만. 측정 계획·합격 기준(phases/00 §4.6): 처리량·종단 지연, Redis RSS ≤ 256MiB, `kill -9` 후 누락 0, 소비자 복구, DB 부하.

## 대안과 기각 이유
| 안 | 이유 |
|---|---|
| 끝까지 Postgres | 단순·안전. 버스트 한계가 측정되면 재검토(기본값으로 유지) |
| 전 소비자 일괄 Streams | 위험 집중. 소비자 단위 점진 전환이 안전 |
| Kafka | 무료 자원 메모리·운영 비용 과다, 규모 대비 과함 |
| NATS JetStream | 경험·스킬 없음, 컨테이너 추가 |

## 결과
- 얻는 것: 정본 불변, 롤백 용이, Phase 3 에 필요한 곳에서만 도입, "측정으로 정했다"는 서사.
- 치르는 것: 두 어댑터와 Reconciler, 그림자 비교 지표, 측정 시험 작성.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| Redis 유실 | Reconciler(최근 10분 창) + 경보 `TransportLoss` |
| 재고·전달의 장애 영역 공유 | ADR-024 장애 거동, 분리 트리거(phases/00 §5.2) |
| 측정 없이 취향으로 채택 | 합격 기준 충족 전 Accepted 금지(기준 완화는 사용자가 명시하고 기록) |

## 검증 방법
phases/00 §4.6 표. 시험은 08 의 동시성·카오스 시험에 추가.

## 실서비스라면
규모가 작으면 DB outbox + 폴링 또는 Streams, 팀 간 재사용·장기 보존이 필요해지면 Kafka.

## 재검토 조건
Phase 3 측정 결과, 이벤트 규모가 초당 수천 건 지속, 수일 이상 이벤트 재생·다수 독립 소비자 그룹 필요.

## 관련 ADR
ADR-005, ADR-006, ADR-010, ADR-020, ADR-021, ADR-024
