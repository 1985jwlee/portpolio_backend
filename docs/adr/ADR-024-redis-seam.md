# ADR-024: Redis — M1 제외와 도입 이음새
- 상태: Accepted
- 날짜: 2026-11-04
- 근거: 사용자 선택("M1 제외 + 도입 이음새 설계") / ADR-006(전달 계층, Proposed) · ADR-010(재고 선점) · ADR-021(선점은 DB 안에서) / ADR-022(M1 스택)
- 관련 문서: [design/00](../design/00-system-overview.md) §4.2, [design/01](../design/01-repository-structure.md), [tech-stack.md](../domains/tech-stack.md)

## 맥락
M1 은 Redis 를 쓰지 않는다(ADR-022). 그런데 그 자리를 무엇이 대신하고, **나중에 Redis 를 붙일 때 무엇을 바꾸는지**가 설계에 없었다. Phase 2(전달 계층 측정)와 Phase 3(타임딜 Lua 선점)이 Redis 를 요구하므로, 이음새를 지금 정해 두지 않으면 그때 코드가 퍼진다.

## 결정
1. **M1 에는 Redis 컨테이너를 두지 않는다.** compose 에는 `redis` 서비스를 **프로필(`redis`)로 정의만** 해 두고 기본 기동에서 뺀다(ADR-002).
2. Redis 가 맡을 수 있는 기능은 **포트(인터페이스) 뒤에 둔다.** M1 구현은 메모리/Postgres 어댑터이고, Redis 어댑터는 **포트 구현만 추가**하면 붙는다. usecase·service·domain 은 바뀌지 않는다.
3. **정본은 Redis 에 두지 않는다.** 선점·멱등·이력의 정본은 Postgres(ADR-021). Redis 는 휘발성 보조(카운터·캐시·전달 파이프)와 Phase 3 의 재고 선점 한정이다.
4. 도입 여부는 **측정으로** 정한다(§도입 기준). Redis 와 Valkey 선택은 도입 시점의 ADR-006 후속에서 한다.

## 설계 상세

### 포트 (정본 위치 `packages/kernel/ports`, 구현 `packages/infra`)
| 포트 | 책임 | M1 어댑터 | Redis 어댑터(후속) |
|---|---|---|---|
| `RateLimiter` | 키(세션·행위자)별 토큰 버킷/윈도우 판정 | 프로세스 메모리 | `INCR`+TTL 또는 스크립트 |
| `PresenceCounter` | 접속자 수 집계(근사) | gateway 메모리 | 집합/카운터 + TTL |
| `KeyValueCache` | 짧은 TTL 캐시(세션 검증 결과 등) | 프로세스 메모리 | `GET`/`SET EX` |
| `EventTransport` | outbox 이벤트를 구독 모듈로 전달 | Postgres 폴링 + `NOTIFY` | Redis Streams(소비자 그룹) — ADR-006 |
| `StockReservation` (Phase 3) | 재고 원자 선점 | — | Lua 스크립트(ADR-010) |

- `EventTransport` 는 **ADR-006 의 전달 인터페이스와 같은 것**이다. 구독 쪽은 항상 `ReceiveMessage` → inbox 저장이라 전달 계층이 바뀌어도 소비자는 안 바뀐다(ADR-020).
- 포트는 `kernel` 에, 구현은 `packages/infra/{memory,postgres,redis}` 에 둔다. 의존 규칙: **`domain`/`service`/`usecase` 는 구현 패키지를 임포트할 수 없다**(경계 규칙에 추가, design/01).

### M1 기능별 처리 (Redis 없이)
| 기능 | M1 처리 | 알려진 한계 | Redis 가 해소하는 것 |
|---|---|---|---|
| 세션 속도 제한 | 메모리 버킷(api 프로세스). IP 기준은 nginx `limit_req` | api 를 여러 개 띄우면 한도가 인스턴스별 | 인스턴스 간 공유 한도 |
| 접속자 수 | gateway 메모리 합 | gateway 인스턴스 합산 불가 | 합산 |
| 세션 검증 캐시 | gateway 메모리 30초 | 인스턴스 간 무효화 불가(최대 30초 지연, design/06) | 즉시 무효화 |
| 멱등 키 | Postgres `request_key`(트랜잭션 안) | 쓰기에 DB 왕복 추가 | (옮기지 않는다 — 정합성상 DB 가 낫다) |
| 이벤트 전달 | Postgres 폴링 + `NOTIFY` | 처리량·지연 상한 | 낮은 지연·팬아웃 |

- **M1 은 단일 인스턴스(Compose)** 라 위 한계가 드러나지 않는다. k3d 검증에서 레플리카를 늘릴 때(ADR-002) 한계를 **측정해 기록**하고 도입 기준에 반영한다.

### 도입 기준 (하나라도 충족하면 Redis 어댑터를 켠다)
| 조건 | 측정 방법 |
|---|---|
| outbox→소비 지연 p95 가 목표(예: 1초)를 폴링 주기 조정으로도 못 맞춤 | 지표 `outbox_lag_seconds` |
| Postgres 가 폴링 부하로 쓰기 p95 를 해침 | 부하 시험(k6) 전후 비교 |
| 다중 레플리카에서 공유 속도 제한·presence 가 필요 | k3d 레플리카 시험 |
| Phase 3 재고 선점 착수 | ADR-010 (이 경우 Redis 는 필수) |

도입 시 해야 할 일: ① Redis 어댑터 구현(포트 시험 공용 스위트 통과) ② compose 프로필 활성화, 메모리 상한·`maxmemory-policy` 설정 ③ Redis/Valkey 선택 ADR ④ 장애 모드 시험.

### 장애 시 거동 (도입 후 기준)
| 포트 | Redis 장애 시 | 이유 |
|---|---|---|
| `RateLimiter` | **fail-open** + 지표 경보 (nginx IP 제한은 남음) | 가용성 우선, 방어선이 하나 더 있음 |
| `PresenceCounter` | 마지막 값 유지/숨김 | 표시용 근사값 |
| `KeyValueCache` | 캐시 우회(DB 직접) | 정본이 아님 |
| `EventTransport` | **outbox 에 쌓이고 대기**, Redis 복구 후 재개. Postgres 폴링으로 **폴백 가능**하게 둔다 | 정합성 우선(유실 없음) |
| `StockReservation` | 선점 거부(초과 판매 0 우선) | ADR-010 |

### 시험
- 각 포트는 **계약 시험 스위트**를 하나 갖고, 모든 어댑터(메모리·Postgres·Redis)가 같은 스위트를 통과해야 한다([design/08](../design/08-test-strategy.md)).
- Redis 어댑터가 추가되는 시점에 Redis 컨테이너를 L3 시험 환경에 넣는다.

## 대안과 기각 이유
- **M1 에 Redis 도입(속도 제한·presence·캐시)**: 규모에 과하고 컨테이너·장애 모드가 는다. 이음새만 두면 도입 시점에 같은 효과를 낸다.
- **M1 에서 전달 계층까지 Redis Streams**: ADR-006 의 측정 전 결정이 된다. 범위가 커지고 내구성 설정(AOF) 위험을 M1 에 끌어들인다.
- **Redis 를 정본으로 사용(멱등·선점)**: 상태가 DB 와 분리되어 정합성 문제(ADR-021 에서 기각).
- **이음새 없이 직접 호출**: 도입 시 usecase 전반을 고쳐야 한다.

## 결과
- 얻는 것: M1 풋프린트 유지, 도입 시 어댑터만 추가, 도입 근거가 측정으로 남는다.
- 치르는 것: 포트·어댑터 패키지(`packages/infra`)와 계약 시험 스위트를 만들어야 한다. 메모리 어댑터는 다중 인스턴스에서 한계가 있다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 포트가 Redis 에 맞춰 과설계됨 | 포트는 현재 필요한 연산만, 어댑터 둘(메모리·Postgres)로 실제 사용하며 검증 |
| 메모리 어댑터 한계를 잊음 | 문서(위 표)와 k3d 레플리카 시험으로 한계를 수치화 |
| 도입이 계속 미뤄짐 | 도입 기준 표를 Phase 2 착수 전 검토 항목으로 둔다(ADR-006) |

## 검증 방법
- 경계 검사: usecase 가 `packages/infra` 를 임포트하면 CI 실패.
- 포트 계약 스위트가 메모리·Postgres 어댑터에서 통과.

## 실서비스라면
매니지드 Redis(복제·페일오버)를 두고 캐시·속도 제한·전달을 용도별로 분리한다.

## 재검토 조건
도입 기준 충족. Phase 2 착수(ADR-006 확정 시). Valkey 로 전환 여부.

## 관련 ADR
ADR-002, ADR-006, ADR-010, ADR-020, ADR-021, ADR-022
