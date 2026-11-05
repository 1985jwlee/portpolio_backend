# ADR-042: 이중 원장 — 판매 재고와 물리 재고, 2단계 할당
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04
- 근거: Phase 6 WMS 항목(ADR-016) / ADR-010(상거래 재고 정합성)·ADR-021(동시성)·ADR-025(쿼리 계층)·ADR-026(데이터 보호) / [phases/03-fulfillment.md](../design/phases/03-fulfillment.md) §3.4·§4
- 구현 순서(P0 D24): 6c (Phase 5 이후). 약정 활성화와 진행 중 딜 초기 동기화는 P0 §1.4 G5.

## 맥락
상거래(ADR-010)는 타임딜 재고를 Redis Lua 로 선점하고 확정 수량을 Postgres 에 둔다. 그런데 **창고의 물리 재고**는 별개의 사실이다. 판매는 했는데 물리 재고가 없거나(오버셀), 물리 재고는 있는데 팔 수 없는 상태(격리·파손)가 생긴다. 두 정본이 서로 모르면 풀필먼트 시점에 불일치가 드러난다.
또 같은 SKU 에 대한 동시 할당은 재고 정합성의 핵심 경합점이다.

## 결정
1. **세 가지 수량을 분리한다.** ① 물리 재고(원장에서 파생) ② 약정(주문 할당 + 채널 약정) ③ 판매 가능 재고(상거래 소유, 약정을 넘지 못함). `available_total` 은 **ISSUE 로 건물을 떠나기 전까지의 판매 대상 위치**(`SELLABLE_KINDS = STORAGE·PICK_FACE·STAGING`)의 AVAILABLE 합이다 — `PICK`·`PUTBACK`·`MOVE` 같은 집합 안 이동은 합계를 바꾸지 않는다.
2. **물리 재고의 정본은 추가 전용 이동 원장**(`inventory.ledger_entry`)이다. 잔고(`stock_balance`)와 포지션(`sku_position`)은 같은 트랜잭션에서 갱신하는 **물질화된 파생값**이고 대사로 검증한다. 모든 이동은 `from → to` 쌍이고 창고 밖은 가상 위치 `EXTERNAL` 이다.
3. **할당은 2단계**다. (a) SKU 수준 약정: `sku_position` 조건부 UPDATE 가 **불변식 `allocated + earmarked ≤ available` 의 단일 심판**. (b) 로케이션 수준 계획: 출고 지시 시점에 로트·위치를 고른다. (b) 가 실패해도 (a) 는 유지되고 쇼트 피킹 예외로 푼다.
4. **채널 약정(earmark)**: 타임딜은 게시(`deal.published`) 시 `inventory` 에 물리 재고를 먼저 묶는다(`EarmarkStock`, 조건부 UPDATE; 실패 시 `inventory.earmark_rejected`). **판매 가능 총량은 약정을 넘지 못한다 — 이 상한 규칙은 상거래(`deal`)가 받는다**(`deal_read.sku_capacity` 1차 검증 + 약정이 최종 심판, 동기 호출 없음). 주문 결제 시 약정이 할당으로 소비된다. **약정 해제 규칙**: 딜 `closed` 는 약정을 바꾸지 않고, 딜 `settled`(`deal.settled {confirmedQty}`)에서 **`totalQty − confirmedQty` 만 해제**한다 — 결제는 확정됐지만 `order.paid` 가 아직 소비되지 않은 주문이 있어도 약정이 이미 사라진 일이 없게 하려는 것이다. 취소로 풀린 재고의 판매 가능 복원은 `deal.restocked` 로 약정 `+qty` 와 쌍이다. 이벤트 이름은 [phases/00 §8.3](../design/phases/00-platform-evolution.md) 정본(`deal.published`·`deal.settled`·`deal.stock_adjusted`·`deal.restocked` 수신).
5. **트랜잭션 경계**: 1단계 할당은 `fulfillment.AcceptOrder`(조율자)가 **한 트랜잭션**에서 접수·`inventory.AllocateInTx`(줄마다 `sku_id` 오름차순)·상태 확정·outbox(`fulfillment.accepted | rejected`)를 함께 커밋하는 B12 허용 쌍 #10 이다. 같은 쌍의 다른 호출은 `ReleaseAllocationInTx`·`IssueInTx`·`RecordMovementInTx`(PICK·PUTBACK·RETURN_RECEIPT·RESTOCK·DISPOSE)이고 목록은 phases/03 §8.4 이다. `inventory` 는 상위 모듈을 호출하지 않는다.
6. **대사 6종**(R1~R6)을 정기 실행한다. 파생값(R1~R3)은 자동 재계산, 두 정본이 다른 경우(R4)·보존 법칙 위반(R5)·실사 차이(R6)는 사람 개입 큐로 보낸다.

## 설계 상세

### 불변식
```
P1 allocated_total + earmarked_total ≤ available_total        (sku_position CHECK + 조건부 UPDATE)
P2 stock_balance.on_hand ≥ 0                                  (CHECK)
P3 원장 합 = 잔고                                             (같은 tx 갱신 + R1)
P4 issued ≤ allocated                                         (출고 UPDATE 조건)
P5 한 주문 줄당 활성 할당 합 ≤ 주문 수량                       (usecase + 시험; DB 단일 CHECK 로 표현 어려움)
P6 원장은 불변                                                (애플리케이션 경로에 UPDATE/DELETE 없음)
```

### P1 이 이동마다 안정한 이유 (숫자 검증)
시작: STORAGE 10, `allocated=10` (전량 할당). `PICK` 1 → `available` 10 유지(STORAGE→STAGING, 집합 안), P1 ✓. `ISSUE` 1 → `available 9`·`allocated 9` **동시** 감소, P1 ✓, ATP 불변(이중 계산 없음). 취소: `PUTBACK` 1(`available` 유지) + 할당 해제(`allocated 9`) → ATP +1. 파손 `ADJUST_MINUS` 1 은 `available − q ≥ allocated + earmarked` 불충족이라 거절 → 영향받는 할당을 먼저 해제하고 재할당·백오더·취소로 푼 뒤 조정한다. 상세 표는 phases/03 §3.4.

### SKU 수준 할당 (개념)
```
UPDATE inventory.sku_position
   SET allocated_total = allocated_total + :q, version = version + 1
 WHERE sku_id = :sku AND available_total - allocated_total - earmarked_total >= :q
```
0 행이면 부족이다. 같은 SKU 의 포지션 행은 한 번에 한 트랜잭션만 쓰므로 할당이 직렬화된다. 다품목 주문은 포지션 행을 **`sku_id` 오름차순**으로만 갱신해 (A,B)·(B,A) 주문의 교착을 막는다. 처리량은 트랜잭션 2~5ms 가정 시 SKU 당 초당 200~500 건(제안, 미측정). 타임딜 폭주는 상거래의 Redis 선점이 이미 걸러내므로 여기 도달하는 속도는 결제 완료 속도다.

### 왜 이중 원장인가
- 판매 가능 재고만 있으면 물리적 현실(격리·파손·분실·실사 차이)을 표현할 수 없다.
- 물리 재고만 있으면 타임딜 같은 고속 선점에서 DB 경합이 커진다(ADR-010 이 Redis 를 쓴 이유).
- 둘을 **약정이라는 단일 접점**으로 이으면 각 정본의 책임이 분명하고, 불일치는 약정 대사(R4) 한 곳에서 잡힌다.

## 대안과 기각 이유
- **상거래 재고 하나로 통합**: 물리 현실을 표현 못 하고 타임딜 경합 문제를 DB 로 끌어들인다.
- **잔고만 두고 원장 없음**: 변동 근거가 없어 대사·감사·재구성이 불가능하다.
- **위치 수준 할당을 주문 수신 시 확정**: 재고 이동·보충 변화가 반영되지 않아 쇼트가 늘어난다.
- **SKU 포지션 없이 위치 잔고만 잠금**: 불변식의 단일 심판이 없어 부분 잠금·교착·거짓 부족(SKIP LOCKED)이 문제된다.
- **Redis 에 물리 재고**: ADR-010·021 이 정본을 DB 에 두는 원칙과 충돌한다.

## 결과
- 얻는 것: 오버셀 방지의 근거(약정 ≤ 물리), 모든 재고 변동의 추적성, 대사로 자기 점검.
- 치르는 것: 원장 + 잔고 + 포지션 + 할당 + 약정 5종 테이블과 대사 잡, 핫 SKU 직렬화, 상거래와의 약정 계약.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 핫 SKU 포지션 행 경합 | 처리량 측정(W2), 필요 시 슬롯 분할(미결) |
| 다품목 주문 간 포지션 행 교착 | `sku_id` 오름차순 갱신 규칙(CI 코드 리뷰 체크, AC-WM-14 동시성 시험) |
| 딜 마감과 늦은 `order.paid` 사이에 약정이 사라짐 | 약정 해제는 `settled` 에서 `totalQty − confirmedQty` 만(AC-WM-15) |
| 원장 증가 | 파티셔닝 후보(미결), 월별 요약 테이블 |
| 두 정본 불일치(R4) | 약정 이벤트 + 대사 + 경보, 사람 개입 큐 |
| 파생값 드리프트 | 같은 tx 갱신 + R1~R3 자동 재계산 + `pf_wms_invariant_violations_total` |
| 로케이션 선택의 거짓 부족 | SKIP LOCKED 1차 후 일반 FOR UPDATE(id 순서) 2차 |

## 검증 방법
- 속성 기반: 임의 이동 시퀀스에서 P1~P4 유지, 원장 합 = 잔고.
- 동시성: 마지막 1개에 N=50 동시 할당 → 정확히 1건.
- 대사: 불일치 주입 → R1~R6 검출, 정상 데이터 오탐 0.

## 실서비스라면
다중 창고·재고 풀, 사전 슬롯 분할, ERP 와의 야간 대사, 재고 가시성 서비스(ATP 캐시)를 둔다.

## 재검토 조건
핫 SKU 직렬화가 p95 를 위협할 때. 다중 창고가 필요해질 때. 상거래가 재고 정본을 옮기려 할 때(ADR-010 변경).

## 관련 ADR
ADR-010, ADR-016, ADR-021, ADR-025, ADR-026, ADR-043
