# ADR-043: 주문→출고 사가 — 하이브리드 조정과 보상
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04
- 근거: Phase 6 WMS 항목(ADR-016) / ADR-005(outbox)·020(inbox)·021(선점·임대·펜싱·낙관적 버전)·025 / [phases/03-fulfillment.md](../design/phases/03-fulfillment.md) §5
- 구현 순서(P0 D24): 6c.

## 맥락
결제 확정부터 배송 완료까지는 여러 모듈과 사람의 작업(피킹·패킹)을 가로지르는 장기 흐름이다. 중간에 재고 부족, 취소, 파손, 배송 실패가 생기고, 각각에 대해 이미 한 일을 되돌리거나 환불 요청 같은 보상을 해야 한다. 흐름이 흩어지면 추적과 보상 정의가 어렵다.

## 결정
1. **모듈 간은 코레오그래피, 모듈 안은 오케스트레이션**(하이브리드).
   - commerce ↔ fulfillment: 이벤트로만 만난다 (`order.paid` → `fulfillment.accepted | rejected` → `shipment.dispatched` → `shipment.delivered`; 결제 후 취소 `order.cancel_requested`(또는 외부 사유 `order.cancelled`·`order.disputed`·`payment.refunded`) → `fulfillment.cancelled | cancel_rejected`; 반품 `order.return_requested` → `return.received` → `return.inspected`; 주소 정정 `order.address_corrected`). 이름은 [phases/00 §8.3](../design/phases/00-platform-evolution.md) 정본이다. 배송지는 이벤트에 싣지 않고 `shippingAddressRef` 로만 받아 **`AcceptOrder` 시점**에 `order.GetShippingAddress` 로 읽어 풀필먼트 자기 봉투로 다시 암호화한다.
   - **`AcceptOrder` 는 단일 트랜잭션**이다: 접수 + 할당(`AllocateInTx`) + 상태 확정 + outbox 를 함께 커밋하고, `fulfillment.accepted` 는 **할당 성공 후에만** 발행한다(실패하면 같은 tx 에서 `rejected`). 그래서 "수락 후 거절"과 "접수만 되고 할당 전 크래시"가 없다. 수락 뒤의 중단은 `fulfillment.cancelled`(상거래 주문은 `fulfilling → cancelled` 로 받는다). 이벤트의 outbox 집합체 키는 `orderId` 로 통일해 주문 단위 순서를 보장한다.
   - fulfillment 안: `FulfillmentOrder` 애그리거트가 **프로세스 매니저**. 상태와 다음 단계를 한 행(`version` 조건 갱신)이 갖고, 작업(PickTask, Package, Shipment)과 이벤트가 구동한다.
2. **모든 단계는 멱등이고 재시작에 안전**하다 (inbox PK, 유일 키, 상태 조건부 UPDATE).
3. **보상은 이벤트로 표현**한다. 풀필먼트는 환불을 직접 하지 않고 `fulfillment.rejected`·`fulfillment.cancelled`·`return.inspected` 를 발행하며, 환불은 상거래(결제)의 책임이다 — 소비자는 `payment-fulfillment-refunder`(P2, 환불 멱등 키는 이벤트 id 파생)다.
4. **취소는 판정표**(`CancelPolicy`)로 결정한다. 물리 진행 상태에 따라 즉시 취소 / 되돌림 후 취소 / 취소 불가(출고 후 반품 경로)로 갈린다.
5. **피킹 작업은 선점·임대·펜싱 토큰**으로 작업자 간 경합을 푼다. 작업 중 중단된 진행분은 유지되고 같은 작업이 `OPEN` 으로 복귀한다.
6. **사람 개입이 필요한 이상**은 자동 보상을 시도하지 않고 `ON_HOLD` + 예외 케이스로 보낸다(대기는 보상이 아니다).
7. **교환 신규 주문은 출고 게이트로 보류한다**(U23): 접수·할당은 일반 주문과 같고 `release_gate_return_id` 가 있는 동안 웨이브 후보에서 제외되며, 연결 반품의 `return.inspected` 환불 판정과 같은 트랜잭션에서 게이트가 풀린다(`REJECTED` 면 취소 판정표). 분할 배송은 구매자에게 배송 N건(`shipmentSeq`, `allDelivered`)으로 노출하고 주문 `delivered`·에스크로 해제 기한은 `allDelivered` 에서만 시작한다.

## 설계 상세

### 비교
| 방식 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 순수 코레오그래피 | 모듈 결합 낮음 | 전체 흐름·보상 규칙이 이벤트 핸들러에 흩어짐, 추적 어려움 | 모듈 간에만 |
| 순수 오케스트레이션(전 구간) | 흐름 명시 | 조정자가 상거래 상태까지 소유해 결합·크기 증가 | 기각 |
| **하이브리드** | 경계는 이벤트, 내부는 명시 상태 머신 | 두 방식을 구분해야 함 | **채택** |

### 보상 표
| 실패 지점 | 이미 한 일 | 보상 | 발행 |
|---|---|---|---|
| 할당 불가 | 주문 접수 | 접수 거절 | `fulfillment.rejected(reason)` → 상거래가 환불 |
| 피킹 쇼트 | SKU 약정 | 재계획 → 불가 시 예외 케이스 → 취소/환불 | `fulfillment.cancelled` |
| 패킹 불일치·파손 | PICK 원장 | PUTBACK, 재할당 시도 | 필요 시 `fulfillment.cancelled` |
| 라벨 발급 실패 | PACKED 직전 | 재시도(백오프) → 대체 택배/수동 | 예외 케이스 |
| 배송 실패(시도 소진) | ISSUE 완료 | 반송(`RETURNED_TO_SENDER`) → `ReturnCase(origin=RTS)` → 반송 입고·검수·`RESTOCK` | `shipment.delivery_failed`(상거래: 에스크로 14일 상한 중지·환불/재배송 결정) → 반송 후 `return.inspected {orderId, origin:RTS}` |
| 주소 정정 불가(ON_HOLD 72시간 경과) | 할당 | 할당 해제 | `fulfillment.cancelled {reason: ADDRESS_NOT_CORRECTED}` |
| 배송 불가 지역 | — | 접수 단계 거절(할당 없음) | `fulfillment.rejected {reason: ADDRESS_UNSHIPPABLE}` |
| 취소(PICKING) | PICK 원장 일부 | PUTBACK + 할당 해제 | `fulfillment.cancelled` |
| 취소(PACKED 이후) | 라벨 발급 | 불가 → 출고 후 반품 | `fulfillment.cancel_rejected` |

### 외부 호출 (택배 어댑터)
ADR-021 4번에 따라 **선점(트랜잭션 1) → 외부 호출 → 완료(트랜잭션 2)**. 외부 호출은 택배사 멱등 키(`fo_id + seq`)와 `shipment` 유일 (`fo_id`,`seq`) 로 재시도 안전하게 한다. 호출 성공 후 완료 트랜잭션 전에 죽으면 재시도가 같은 운송장을 돌려받는다.

## 대안과 기각 이유
- **2PC·분산 트랜잭션**: 모듈러 모놀리스에서 불필요하고 확장 경로(서비스 분리)에서 깨진다.
- **상거래가 흐름 전체를 오케스트레이션**: 물리 작업의 상태까지 상거래가 알아야 해 경계가 무너진다.
- **자동 보상만(사람 개입 없음)**: 파손·분실 같은 판단은 자동화 비용이 크고 오판 위험이 높다.

## 결과
- 얻는 것: 흐름이 상태 머신으로 명시, 보상 규칙이 한 곳, 모듈 경계가 이벤트로 깨끗.
- 치르는 것: 판정표·상태 머신 시험이 많다, 상거래와 이벤트 계약 합의가 선행.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 상태 전이 경합(취소 vs 진행) | `version` 조건부 UPDATE, 진 쪽은 최신 상태로 재판정 |
| 이벤트 중복/순서 역전 | inbox 멱등 + 집합체별 선두 규칙(F13, 집합체 키 = `orderId`) + `fulfillment_order_event` 이력 |
| 보상 누락 | 이벤트 계약 시험(모든 실패 경로가 환불 근거 이벤트를 낸다), 대사 |
| ON_HOLD 방치 | 예외 큐 체류 시간 경보 |

## 검증 방법
- 상태 머신 전이 표 시험(모든 허용/금지 전이).
- 취소 판정표 각 행 E2E, 취소 vs 진행 경합 시험.
- 모든 실패 경로가 상거래가 소비할 보상 근거 이벤트를 발행함을 계약 시험.

## 실서비스라면
Temporal 같은 워크플로 엔진, 보상 SLA 와 알림, 감사 가능한 사가 로그를 둔다.

## 재검토 조건
풀필먼트를 별도 서비스로 분리할 때(ADR-030 판정). 사가 단계가 늘어 상태 머신이 감당되지 않을 때.

## 관련 ADR
ADR-005, ADR-010, ADR-016, ADR-020, ADR-021, ADR-042, ADR-044
