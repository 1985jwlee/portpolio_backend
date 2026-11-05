# ADR-040: 에스크로·정산 상태 머신과 복식 원장
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1)
- 날짜: 2026-11-04
- 근거: ADR-016(에스크로 초안·자동 확정 기한 미결), ADR-011(정산 통화) / Phase 5 DoD
- 구현 순서(P0 D24): `ledger`(POINT·모의 USDC)와 **최소 `escrow`**(`held`·`released`·`refunded` 의 hold / release / refund 만, `ConfirmPurchase` 가 `escrow` 행을 만들고 환불 쌍 #7 도 활성)는 Phase 3, 분쟁(`disputed`)·반품 동결(`frozen`)·`settlement`·자동 확정 타이머는 Phase 5 가 확장한다(소급 이관 절차는 없다, P0 §1.4 G4). 혼합 결제의 다리별 에스크로·정산 분개는 [ADR-048](ADR-048-mock-currency-and-mixed-payment.md).
- 관련 문서: [design/phases/02-commerce.md](../design/phases/02-commerce.md) §7~§9, [phases/00 §2.4~2.5](../design/phases/00-platform-evolution.md)
- **원장 소유**: `ledger` 모듈은 하나이고 **이 ADR 이 스키마 정본**이다(P0 D20). 바둑 보상은 [ADR-037](ADR-037-simulated-points-ledger.md)이 같은 원장의 `POINT` 자산 규칙과 `reward` 상태 머신으로 정의한다. 다른 모듈은 `ledger` 의 공개 `*InTx`(`PostJournalInTx`·`ReverseJournalInTx`·`ConfirmRewardInTx`·`FlagRewardInTx`)만 쓴다(B12).

## 맥락
ADR-016 은 에스크로 상태 흐름만 초안으로 두고 자동 확정 기한을 미결로 남겼다. 정산·원장의 계정 체계, 반올림, 분쟁 판정 주체도 정해지지 않았다.

## 결정
1. **에스크로**: 결제 승인과 **같은 트랜잭션에서 `held` 로 생성**(Phase 3 부터). `held → released | disputed | refunded | frozen`, `frozen → held(재개) | refunded | disputed`, `disputed → released | refunded`. Phase 3 은 `held → released | refunded` 만 쓰고 나머지 전이와 자동 확정 타이머는 Phase 5 가 추가한다. 환불 규칙의 대상은 해제 전(`held`·`frozen`·`disputed`)이다. **`frozen`** 은 반품 요청(`order.return_requested`)이나 배송 실패(`shipment.delivery_failed`)로 **해제 타이머를 멈춘** 상태다(반품 환불 판정이면 `refunded`, 반품 거절이면 기한 재설정 후 `held`). 모든 전이는 조건부 UPDATE, 자동 확정·수동 확정·분쟁·동결은 `held` 에서 한 쪽만 성공.
2. **자동 확정 기한(ADR-016 미결 해소, U10 확정 2026-11-05)**: 배송 완료 후 **7일**, 배송 완료 이벤트가 없으면 출고 후 **14일**(`delivery_failed` 가 오면 이 상한을 중지). **반품 가능 기한은 배송 완료 후 5일로 자동 확정(7일)보다 짧게** 두고 설정 검증이 `RETURN_WINDOW_DAYS < ESCROW_AUTO_RELEASE_DAYS_AFTER_DELIVERY` 를 강제한다(반품 요청이 해제 전에 도달해야 `frozen` 이 의미를 가짐). 설정 키로 빼고 **시연용 시간 압축**(`ESCROW_TIME_SCALE`)을 둔다. 값 7일은 U10 으로 확정됐고(관행을 단순화한 값, 시연은 `ESCROW_TIME_SCALE` 로 시간 압축) 14일 상한은 이에 딸린 설정값이다.
3. **분쟁**: 구매자 제기(자유 텍스트 ENC), 관리자 수동 판정(`seller_wins`/`buyer_wins`), 부분 판정과 SLA 는 범위 밖.
4. **정산**: `escrow.released` 를 `settlement` 가 소비해 `settlement.escrow_id` 유일로 한 번만 생성. 환율은 **결제 시작 시 고정한 스냅샷**을 쓴다. **모든 결제 수단(포인트 포함)** 이 결제 시작 시 스냅샷을 고정한다. 환산은 단일 함수이고 **임의 정밀도 정수**(JS `BigInt`/SQL `numeric`; `krw·10¹⁴` 는 `krw > 92,233` 에서 64비트를 넘는다)로 계산한다: `gross = floor(krw·10¹⁴/rate)`, `net = floor(krw·10¹⁴·(10000−bps)/(rate·10000))`, `fee = floor(krw·10¹⁴·bps/(rate·10000))`, `dust = gross − net − fee ∈ {0,1}`(표시용은 `half_up`). `rounding_dust` 는 원장 행으로 보존하며 항등 `net+fee+dust=gross`. **정산 입력은 에스크로의 잔여 다리다**(부분 환불이 있었던 경우 `escrow_leg.amount − refunded_amount`): 잔여 POINT 다리 `P_rem`, 잔여 USDC 다리 `u_rem`, `T_rem = P_rem(1 POINT = 1 KRW) + 잔여 USDC 다리의 결제 시 KRW 가치`. `gross_rem = max(floor(T_rem·10¹⁴/rate), u_rem)`, 플랫폼 부담 `r = gross_rem − u_rem`(항상 ≥ 0, 반올림 초과분도 `exp:point_redemption:USDC` 로 일관 처리하고 `rev:rounding_dust` 에 섞지 않는다), `net = floor(gross_rem·(10000−bps)/10000)`, `fee = floor(gross_rem·bps/10000)`, `dust = gross_rem − net − fee ∈ {0,1}`. 환불이 없으면 `u_rem=u`·`T_rem=T` 이고 위 식은 앞의 식과 같은 수치를 낸다. 정산 분개는 비 USDC 잔여 다리 0~1건 + USDC 정산 1건(USDC 다리의 해제 분개는 정산 분개에 합친다), 금액 0 인 라인은 생략한다(P2 §9.1). 속성 시험(무작위 10만 건, 부분 환불 1~5단계 후 정산, 2026-11-05 로컬): 자산별 차변≠대변 0건, `r<0` 0건, `dust ∉ {0,1}` 0건, 음수 잔액 0건(`max(·, u_rem)` 를 빼면 8,117건에서 `r<0` 이 나오므로 이 정의가 필요하다 — P2 §8.5.1 시험).
5. **복식 원장**: `journal`/`posting`, 자산(`KRW`/`POINT`/`USDC`)별 차변=대변을 **지연 제약 트리거**로 강제, 추가 전용, 정정은 역분개, `idempotency_key` 유일, 계정 잔액은 같은 트랜잭션의 조건부 갱신. **음수 방지는 ledger 모듈의 계정 유형별 규칙**: `min_balance = 0` — `liab:user_points:*`, `liab:user_usdc:*`, `liab:escrow:*`, `liab:seller_payable:*`, `asset:pg_receivable:*`; 하한 없음 — `fx:clearing:*`(`fx:clearing:POINT` 포함), `exp:*`, `rev:*`, `asset:payout_marked:*`(`asset:payout_marked:USDC` 포함). **이 목록이 정본이다**(P2 §9.2 는 인용만 한다). `POINT_KRW_RATE` 는 **1:1 고정**이며 설정 항목이 아니다. **전역 락 순서**는 `reservation → deal.stock → user_purchase → payment → escrow → ledger 계정(id 오름차순) → order` 이고 확정·환불·정산 트랜잭션이 모두 따른다(한 분개가 여러 계정을 갱신할 때 계정 id 오름차순이 그 일부). 확정 보상은 역분개하지 않으므로(ADR-037) 사용자 포인트 잔액이 음수가 되는 경로가 없다. 공개 `InTx` 시그니처는 `(tx: TxContext, …) => Result<…, LedgerError>`. 정산 후 환수는 M1 범위 밖.
7. **상품 교환은 두 독립 흐름으로 표현한다**(U23, 2026-11-05): 교환 = 반품 케이스에 연결된 신규 주문(`exchange_of_order_id`). 신규 주문은 **전액을 독립 결제·독립 에스크로**로 보류하고, 원 주문의 반품 줄은 검수 환불 판정 후 **별도 환불**한다 — 가격차(신규 > 원: 순 차액 결제, 신규 < 원: 순 차액 환불)는 두 흐름의 순 효과이고 합산 분개를 만들지 않는다. 원 에스크로는 교환 요청에서 `held→frozen`, 환불 후 전량이면 `refunded`, **부분이면 `escrow_leg.refunded_amount` 증가 후 `frozen→held`** 로 재개해 정산 입력이 잔여 다리(결정 4)로 유지된다. 교환 취소·검수 `REJECTED` 는 반품 거절과 같은 `frozen→held`(기한 재설정)다. **어떤 트랜잭션도 두 에스크로를 동시에 잠그지 않으므로** 전역 락 순서(결정 5)가 그대로 지켜진다. 원 에스크로 잔여분을 신규 에스크로로 직접 이월하는 방식은 두 에스크로 동시 잠금과 다리 구성 매칭이 필요해 채택하지 않았다(대가: 구매자 자금의 일시 이중 점유). 상세는 설계 문서 §5.5.
6. **seller 역할은 없다**(P0 D11, 단일 판매자 = 운영자). 정산 대상 판매자 계정은 시드 데이터 1~2개이고 온보딩·KYC 는 없다. 정산 "지급"은 모의 표시.

## 설계 상세
계정 체계·대표 분개·대사 질의는 설계 문서 §9. 정산 실행은 외부 호출이 없어 선점→환산→완료 두 트랜잭션으로 충분하고, Phase 6d 에서 온체인 호출이 두 트랜잭션 사이로 들어온다.

## 대안과 기각 이유
- **단식 장부(잔액 컬럼만)**: 감사·대사 불가.
- **정산 시점의 최신 환율**: 결제 시점 환율 고정(ADR-011)과 모순.
- **자동 확정 없음**: 에스크로가 영원히 열린다.
- **분쟁 자동 판정**: 모의 규모에 과함.

## 결과
- 얻는 것: 재현 가능한 결제→에스크로→정산, 감사 가능한 환율 고정, 자산별 균형 보장.
- 치르는 것: 원장 지연 제약 트리거(raw SQL)와 계정 체계 관리, 이중 시간 설정.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 기한 값이 현실과 다름 | 설정화·시간 압축, 운영 후 조정 |
| 원장 불균형 | 트리거+대사 잡+경보(S1 후보) |
| 반올림 불일치 | 단일 함수+속성 시험 |
| P1 원장 모델과 불일치 | 접점 계약(설계 문서 §12.2) 협의 |
| 교환 신규 결제가 환불보다 먼저라 구매자 자금이 일시 이중 점유되어 잔액 부족으로 교환이 실패 | 화면에 "필요 금액 = 신규 총액(환불은 검수 후)" 명시, `PAYMENT_EXPIRED` 로 원 에스크로 재개, 이월 방식은 재검토 조건 |

## 검증 방법
AC-C17~C19: 에스크로 동시 전이, 전 과정 재현, 분개 균형·시산표 0. 속성 시험(환산).

## 실서비스라면
법적 에스크로·정산 규정, 분쟁 SLA, 정산 주기, 회계 시스템 연동.

## 재검토 조건
교환 신규 결제의 이중 점유가 시연에서 문제로 드러날 때(에스크로 이월 방식 재검토). P1 원장과 충돌할 때. 정산 후 환수 요구가 생길 때. 자동 확정 기한 조정이 필요할 때.

## 관련 ADR
ADR-011, ADR-016, ADR-021, ADR-025, ADR-026, ADR-038, ADR-039, ADR-041
