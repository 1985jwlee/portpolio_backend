# ADR-038: 재고 선점과 Redis 의 역할 — 두 게이트, 구매 확정 동기 갱신
- 상태: **Proposed** (사용자 확정 대기)
- 날짜: 2026-11-04
- 근거: ADR-010(재고 정합성)의 상세화와 한 군데 조정 / Phase 3 DoD(초과 판매 0 + 부하 결과) / 로컬 사전 시험(Redis 8.10.3·PostgreSQL 18, 2026-11-04)
- 구현 순서(P0 D24): Phase 3 (순서 2). `inventory` 약정은 6c 전까지 꺼져 있다(`INVENTORY_EARMARK=off`, P0 §1.4 G5). 결제 TTL 의 `method` 는 `ledger`/`card_test`(ADR-048).
- 관련 문서: [design/phases/02-commerce.md](../design/phases/02-commerce.md) §3~§4, ADR-005·020·021·024·025

## 맥락
ADR-010 은 Redis Lua 로 선점하고 확정은 outbox 소비자가 **비동기로 차감**한다고 적었다. 이 구조에서는 DB 가 "초과 확정"을 원자적으로 거절할 수 없다. 소비자가 늦게 두 번 차감하거나 Redis 가 틀리면 DB 는 그대로 받아들인다. "초과 판매 0건"의 근거가 앱 로직에만 있게 된다. 또 구매 확정은 주문·결제·원장·에스크로를 함께 바꿔야 해서 모듈 경계 문제가 생긴다.

## 결정
1. **두 게이트로 역할을 나눈다.** Redis `avail`(Lua 원자)은 폭주를 DB 앞에서 거르는 **빠른 게이트**, Postgres `deal.stock` 의 `CHECK (confirmed >= 0 AND confirmed <= total)` 와 조건부 UPDATE 는 **하드 게이트**다. 초과 판매 방지의 근거는 하드 게이트다.
2. **재고 확정 수량은 구매 확정 트랜잭션 안에서 동기 갱신한다**(ADR-010 조정). 소비자는 읽기 모델·Redis 확정 동기화·알림을 맡는다.
3. **Redis 스크립트 4종**(`reserve`, `confirm`, `release`, `restock`)을 멱등으로 설계하고, 시간 판정은 스크립트 안 `TIME` 으로 한다. 키는 딜 단위 해시 태그 `{deal:<id>}`. `restock` 은 **출고 전 취소로 되돌아온 확정 수량**을 복원한다(멱등 키 `restock:<orderId>`).
4. **키가 없으면 fail-closed.** Redis 유실 직후 구매가 새어 나가지 않는다. 자동 재구성(PG 기준)으로 복구한다.
5. **예약은 종결 후 되살리지 않는다.** 만료·해제된 예약에 늦은 결제가 오면 새 예약을 만들거나 환불한다(I3·I4 에 예외 없음).
6. 구매 확정은 여러 모듈을 한 트랜잭션에 묶기 위해 **`*InTx` 공개 usecase**를 쓴다. 규칙의 정본은 [ADR-030](ADR-030-service-boundary-criteria.md) / [phases/00 §2.4](../design/phases/00-platform-evolution.md)(경계 규칙 **B12**)이고, 이 경로는 허용 쌍 #2(order→deal `ConfirmStockInTx`, 직접)·#3(order→ledger `PostJournalInTx`, 직접)·#4(order→payment `RecordPaymentInTx`, **order 소유 포트로 의존 역전**)·#5(order→escrow `HoldInTx`, 역전)다. 조율자는 `order.ConfirmPurchase` 하나이고 중첩 `uow.run` 은 없다.
7. **타임딜 총량은 풀필먼트 약정 상한을 넘지 못한다.** 이 규칙은 상거래(`deal`)가 받는다: 딜 게시 시 `deal_read.sku_capacity`(inventory 의 `inventory.earmark_changed` 이벤트로 유지)로 1차 검증하고, 최종 심판은 `inventory` 의 약정 조건부 UPDATE(`allocated + earmarked ≤ available`)다. `deal` 은 `inventory` 를 동기 호출하지 않는다(층 규칙). 게시는 `draft→publishing→scheduled`(약정 승인 뒤), 거절이면 `draft` 로 복귀하고, 약정 해제는 딜 `settled` 시 **`total − confirmed` 만**이다(판매된 수량의 약정은 `order.paid` 소비가 쓴다).
8. `PostgresRowLockReservation` 을 시험용으로 구현해 **같은 부하에서 Redis 방식과 비교**한다(ADR-010 이 요구한 증명).

## 설계 상세
- 불변식: (I1) `confirmed ≤ total`(DB), (I2) `confirmed + Σ활성 예약 ≤ total`(빠른 게이트, 대조 점검), (I3) 예약은 확정과 만료/해제 중 하나로만 끝나고 되돌아오지 않음(CAS), (I4) 복원은 예약당 최대 1회.
- 확정 결과는 `Confirmed` / `AlreadyConfirmed`(같은 예약·주문의 중복 확정 → NOOP, **결제 취소 금지**) / `Exhausted`(재고 소진 → 롤백, 카드는 `refund_pending` 후 PG 취소) 셋이다. 웹훅·대사 경로는 inbox `claim_token` + payment `version` CAS 로 직렬화한다.
- 확정 tx 의 행 잠금 순서는 `reservation → stock → user_purchase → payment → escrow → ledger 계정 id 오름차순 → order`, 환불 tx 도 같은 전역 순서를 따른다.
- 예약은 응답 전에 PG 에 영속 기록한다. Redis 에만 있는 예약은 누구에게도 약속되지 않은 것이라 회수해도 안전하다.
- 재구성: 구매 차단 → PG 의 `total`, `confirmed`, 활성 예약으로 `avail`·`res`·`exp`·`user` 재작성 → 차단 해제. 유실 시점에 PG 영속 전이던 예약은 사라진다(응답을 받지 못한 구매자에게만 영향).
- 로컬 사전 시험 결과(합격선 아님, 참고): 재고 100·동시 5,000명 → OK 100/SOLD_OUT 4,900. 같은 멱등 키 500회 → 예약 1. 개인 한도·복원 20회 동시·확정 대 해제 경합 모두 의도대로. PG 하드 게이트 재고 100·동시 3,000건 → 확정 100, 조건 없는 UPDATE 는 CHECK 가 차단. 핫 로우 확정 처리량 약 590 tps(성공 연속, WSL2·도커 볼륨)이다. **이 값은 `stock` 행 하나만 갱신한 것이고 전체 확정 경로(결제·에스크로·원장·주문 포함)는 측정하지 않았다.** 모든 구매 확정이 같은 시스템 계정(`liab:escrow:*` 등) 잔액 행을 갱신하는 전역 핫 로우도 있어, 필요하면 샤드 계정으로 분할한다(L1 전체 경로 결과 후 판정).

## 대안과 기각 이유
- **ADR-010 원안(비동기 차감)**: DB 가 초과 확정을 거절하지 못한다.
- **PG 행 잠금만**: 정합성은 단순하지만 폭주 시 PG 에 직접 부하. 시험 L9 로 정량 비교하고 이점이 없으면 이 ADR 을 재검토한다.
- **사가(단계별 tx + 보상) 구매 확정**: 정합성이 약하고 보상 경로가 늘어난다. 단일 tx 가 단순하다.
- **Redis 를 정본으로**: 유실 시 복구 근거가 사라진다(ADR-010 에서 기각).

## 결과
- 얻는 것: 초과 판매 방지가 DB 제약으로 증명 가능, Redis 는 성능 계층으로 격리, 장애 시 fail-closed.
- 치르는 것: 구매 확정 경로가 여러 모듈을 가로지르는 예외(B12 허용 쌍)를 쓴다. `…InTx` 공개 함수와 허용 목록(`tx-pairs.json`) 관리가 필요하다. 핫 로우 상한은 큰 재고에서 샤딩이 필요하다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| B12 예외가 퍼짐 | 허용 쌍 표로 고정(P0 §2.4), CI 가 목록 밖 호출 차단, 쌍별 원자성 계약 시험 |
| 큰 재고의 핫 로우·시스템 계정 핫 로우 | `stock_shard`·샤드 계정으로 분할(미결, 전체 경로 L1 결과 후) |
| Redis 과대 선점으로 확정 거절 증가 | 대조·재구성, 지표 `pf_purchase_confirm_total{result=rejected_stock}` |
| TTL 오설정 | 결제 시간 측정 후 보정(포인트 60초/카드 10분 제안) |

## 검증 방법
Phase 3 DoD: k6 L1~L10(설계 문서 §4.9), 불변식 위반 0, 초과 판매 0. 카오스(Redis 유실, api 강제 종료, 확정 중 DB 단절).

## 실서비스라면
Redis 복제·센티넬과 재고 샤딩, 대기열(번호표), 결제수단별 TTL 분포 기반 설정.

## 재검토 조건
L9 에서 Redis 방식의 이점이 없을 때. 초과 판매 1건이라도 발생할 때. 핫 로우가 실제 병목일 때.

## 관련 ADR
ADR-005, ADR-006, ADR-010, ADR-020, ADR-021, ADR-024, ADR-025
