# ADR-039: 결제 어댑터와 웹훅 멱등 — 포트, 상태 머신, 승인은 트랜잭션 밖
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04
- 근거: Phase 3·5 / ADR-015(모의), ADR-016(PG 테스트 모드), ADR-020(inbox), ADR-021(선점·펜싱) / 2026-11-04 PG 후보 웹 검색(요약 수준, 재확인 필요)
- 구현 순서(P0 D24): Phase 3 에는 `LedgerGateway`(포인트 우선 + USDC 혼합 결제, [ADR-048](ADR-048-mock-currency-and-mixed-payment.md)) 최소형만, 카드 어댑터·웹훅은 Phase 5(P0 §1.4 G2).
- 관련 문서: [design/phases/02-commerce.md](../design/phases/02-commerce.md) §6

## 맥락
결제는 외부 호출이 있고, 승인 응답·웹훅·대사 세 경로가 같은 결제를 바꾼다. 웹훅은 중복·역전·유실될 수 있고 위조될 수 있다. PG 는 아직 정해지지 않았고 약관·가입 조건이 불확실하다.

## 결정
1. **`PaymentGateway` 포트**(`prepare`/`approve`/`fetch`/`cancel`/`verifyWebhook`) 뒤에 수단을 둔다: `LedgerGateway`(Phase 3), `FakeGateway`(시험), `CardTestGateway`→`TossTestGateway`/`PortOneTestGateway`(Phase 5), `UsdcEscrowGateway`(Phase 6). PG 최종 선정은 **Phase 5 착수 시**로 미루고, 후보 둘이 모두 구현 가능한 최소 공통 계약으로 설계한다.
2. **결제 상태 머신**: `initiated → awaiting_approval → approving → approved | failed | unknown | refund_pending`, `approved|refund_pending|partially_refunded → refunding → refunded | partially_refunded`(`refunding` 의 일시 실패는 `refund_pending` 으로 돌아가 횟수 상한까지 재시도, 영구 실패는 `refund_failed`=수동 처리 큐·경보, `refunding → approved` 전이는 없다), `initiated → expired`. **`refund_pending`** 은 PG 승인은 됐으나 재고 확정이 거절된(`Exhausted`) 상태로 **돈이 잡혀 있어 종결이 아니며**, 같은 tx 에서 `payment_refund` 행(멱등 키 `refund:<paymentId>:rejected_stock`)을 만들어 취소 실패 시에도 환불 행과 대사가 추적한다. 모든 전이는 조건부 UPDATE, (PG 웹훅처럼 순번이 없는 외부 상태에 한해) 상태 순위가 낮아지는 전이는 `NOOP` — 내부 이벤트 소비의 역전 판정은 원천 집합체 순번이다(P2 §5.2, C14). 한 주문 한 활성 결제 유일 인덱스에는 환불 진행 상태(`refund_pending`·`refunding`·`refund_failed`·`partially_refunded`)도 포함한다. **환불 in-flight 는 결제당 1건**(2026-11-05 3차 검토 C1): 새 환불의 선점은 `approved`·`partially_refunded` 에서만, `refund_pending→refunding` 은 기존 환불 행의 재시도 전용이며, 선점 tx 는 `payment → escrow` 순으로 잠그고 같은 tx 에서 `escrow.pending_refund_krw` 를 CAS 로 설정한다(해제·분쟁·재개 차단, P0 R11). 누적 환불이 결제액에 닿으면 `refunded`(잔여 0, `full=true`). `rejected_stock`·`late_sold_out`·`exchange_expired` 환불은 에스크로·원장 보류가 없는 전용 분기다(payment 만 쓴다).
3. **승인 호출은 트랜잭션 밖**(선점 tx1 → 외부 호출 → 완료 tx2). 호출 동안 행 잠금을 쥐지 않고, `claim_token` 이 맞아야 완료한다. 응답 불명은 `unknown` 으로 두고 대사가 확정한다.
4. **웹훅은 inbox 에 저장만 하고 즉시 200**(토스 문서상 10초 제한·최대 7회 재시도). 처리는 `MessageRunner` 가 하며 **항상 PG 에서 권위 상태를 재조회**한다. 서명 검증이 가능하면 검증하되, payload 를 신뢰하지 않는다.
5. **한 주문 한 활성 결제**: `payment` 부분 유일 인덱스.
6. **금액은 서버가 정한다.** 클라이언트 금액은 비교용이며 불일치 시 `FLAGGED` + PG 취소 + 경보.
7. **대사 작업**이 `unknown`/`approving`/`awaiting_approval` 장기 건을 PG 에서 직접 확인한다. 일 1회 전수 대조.
8. **늦은 결제**(예약 만료 후 승인): 만료된 예약을 **되살리지 않고** 재고가 남으면 **새 예약**(멱등 키 `late:<paymentId>`)으로 구매를 살리며, 없으면 `refund_pending` 을 거쳐 자동 환불한다. 종결 상태 불변으로 재고 복원 1회 불변식(I4)을 지킨다.
10. **확정 결과 구분**: 확정 tx 는 `Confirmed` / `AlreadyConfirmed`(같은 결제를 다른 경로가 먼저 정상 확정 → NOOP, **PG 취소 금지**) / `Exhausted`(→ 환불) 를 돌려준다. PG 취소는 `Exhausted`·`late_sold_out` 일 때만 한다. 웹훅·대사 경로는 inbox `claim_token` + payment `version` CAS 로 완료한다.
11. **환불 트리거 소비자** `payment-fulfillment-refunder` 가 `fulfillment.rejected`·`cancelled`·`return.inspected` 를 소비해 `RefundPayment` 를 호출한다. 환불 멱등 키는 `refund:<paymentId>:<eventId>`. **`fulfillment.cancelled{reason:'EXTERNAL'}`(우리 `payment.refunded{full:true}` 의 결과)는 재환불하지 않는다.** `RefundPayment` 는 주문 전이(`MarkCancelledInTx`·`MarkRefundedInTx`)까지 같은 tx 에서 하는 조율자이고(B12 쌍 #7), order·escrow 는 `payment.refunded` 로 상태를 바꾸지 않는다. `payment.refunded`·`refund_pending` 은 `refundLegs[{asset, amount, krwValue}]` 와 `full: boolean` 을 싣는다.
9. 카드번호는 받지도 저장하지도 않는다. `provider_payment_key` 는 **ENC**.

## PG 선정 기준 (착수 시 적용)
① 카드 없이 가입·무료 ② 테스트 모드에서 승인·취소·부분취소·웹훅 재시도 재현 ③ 약관상 모의 시연 허용 ④ 위젯 스크립트·프레임 도메인이 CSP 에 수용 가능 ⑤ 웹훅 검증 수단. 후보: 토스페이먼츠(1순위, 테스트 키·10초/7회 확인), 포트원 V2(Standard Webhooks 헤더 확인), KG이니시스·NICE·Stripe·PayPal(미확인).

## 대안과 기각 이유
- **웹훅만으로 상태 변경**: 위조·역전·유실에 취약.
- **승인 호출을 트랜잭션 안에서**: 행 잠금을 외부 호출 동안 쥐어 장애 전파(ADR-021 규칙 위반).
- **PG 를 지금 확정**: 약관·가입 조건이 불확실해 낡은 결정이 될 수 있다.
- **클라이언트 금액 신뢰**: 변조.

## 결과
- 얻는 것: PG 교체 용이, 중복·역전·유실·위조에 강한 결제 경로, 시험 가능한 `FakeGateway`.
- 치르는 것: 대사 작업·`unknown` 상태·권위 재조회 호출량 증가(PG 호출 한도 확인 필요).

## 위험과 완화
| 위험 | 완화 |
|---|---|
| PG 약관이 모의 시연을 허용하지 않음 | `FakeGateway` 로 전 흐름 완성 후 어댑터는 마지막, 대체 후보 보유 |
| 재조회 호출이 PG 한도에 걸림 | 웹훅 건당 1회 + 대사 주기 조절(미확인 한도) |
| PG 위젯과 엄격한 CSP 충돌 | 결제 라우트에만 별도 헤더(설계 문서 §17.2) |

## 검증 방법
계약 시험 스위트(승인·거절·타임아웃·중복·역전)를 모든 구현이 통과. 카오스: 중복 웹훅, 웹훅 유실, 승인 후 크래시.

## 실서비스라면
PG 계약, 정산 규정, PCI 범위 최소화(위젯 위임), 부정 거래 탐지.

## 재검토 조건
PG 선정 시. 웹훅 서명이 가능한 PG 로 정해질 때(검증 강화). 대사 호출이 한도에 닿을 때.

## 관련 ADR
ADR-015, ADR-016, ADR-020, ADR-021, ADR-026, ADR-038
