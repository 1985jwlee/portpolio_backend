# ADR-040: 에스크로·정산 상태 머신과 복식 원장
- 상태: **Proposed** (사용자 확정 대기)
- 날짜: 2026-11-04
- 근거: ADR-016(에스크로 초안·자동 확정 기한 미결), ADR-011(정산 통화) / Phase 5 DoD
- 관련 문서: [design/phases/02-commerce.md](../design/phases/02-commerce.md) §7~§9, [phases/00 §2.4~2.5](../design/phases/00-platform-evolution.md)
- **원장 소유**: `ledger` 모듈은 하나이고 **이 ADR 이 스키마 정본**이다(P0 D20). 바둑 보상은 [ADR-037](ADR-037-simulated-points-ledger.md)이 같은 원장의 `POINT` 자산 규칙과 `reward` 상태 머신으로 정의한다. 다른 모듈은 `ledger` 의 공개 `*InTx`(`PostJournalInTx`·`ReverseJournalInTx`·`ConfirmRewardInTx`·`FlagRewardInTx`)만 쓴다(B12).

## 맥락
ADR-016 은 에스크로 상태 흐름만 초안으로 두고 자동 확정 기한을 미결로 남겼다. 정산·원장의 계정 체계, 반올림, 분쟁 판정 주체도 정해지지 않았다.

## 결정
1. **에스크로**: 결제 승인과 **같은 트랜잭션에서 `held` 로 생성**. `held → released | disputed | refunded | frozen`, `frozen → held(재개) | refunded | disputed`, `disputed → released | refunded`. **`frozen`** 은 반품 요청(`order.return_requested`)이나 배송 실패(`shipment.delivery_failed`)로 **해제 타이머를 멈춘** 상태다(반품 환불 판정이면 `refunded`, 반품 거절이면 기한 재설정 후 `held`). 모든 전이는 조건부 UPDATE, 자동 확정·수동 확정·분쟁·동결은 `held` 에서 한 쪽만 성공.
2. **자동 확정 기한(ADR-016 미결 해소 제안)**: 배송 완료 후 **7일**, 배송 완료 이벤트가 없으면 출고 후 **14일**(`delivery_failed` 가 오면 이 상한을 중지). **반품 가능 기한은 배송 완료 후 5일로 자동 확정(7일)보다 짧게** 두고 설정 검증이 `RETURN_WINDOW_DAYS < ESCROW_AUTO_RELEASE_DAYS_AFTER_DELIVERY` 를 강제한다(반품 요청이 해제 전에 도달해야 `frozen` 이 의미를 가짐). 설정 키로 빼고 **시연용 시간 압축**(`ESCROW_TIME_SCALE`)을 둔다. 값은 관행을 단순화한 제안이며 미검증.
3. **분쟁**: 구매자 제기(자유 텍스트 ENC), 관리자 수동 판정(`seller_wins`/`buyer_wins`), 부분 판정과 SLA 는 범위 밖.
4. **정산**: `escrow.released` 를 `settlement` 가 소비해 `settlement.escrow_id` 유일로 한 번만 생성. 환율은 **결제 시작 시 고정한 스냅샷**을 쓴다. **모든 결제 수단(포인트 포함)** 이 결제 시작 시 스냅샷을 고정한다. 환산은 단일 함수이고 **임의 정밀도 정수**(JS `BigInt`/SQL `numeric`; `krw·10¹⁴` 는 `krw > 92,233` 에서 64비트를 넘는다)로 계산한다: `gross = floor(krw·10¹⁴/rate)`, `net = floor(krw·10¹⁴·(10000−bps)/(rate·10000))`, `fee = floor(krw·10¹⁴·bps/(rate·10000))`, `dust = gross − net − fee ∈ {0,1}`(표시용은 `half_up`). `rounding_dust` 는 원장 행으로 보존하며 항등 `net+fee+dust=gross`.
5. **복식 원장**: `journal`/`posting`, 자산(`KRW`/`POINT`/`USDC`)별 차변=대변을 **지연 제약 트리거**로 강제, 추가 전용, 정정은 역분개, `idempotency_key` 유일, 계정 잔액은 같은 트랜잭션의 조건부 갱신. **음수 방지는 ledger 모듈의 계정 유형별 규칙**: `min_balance = 0` — `liab:user_points:*`, `liab:escrow:*`, `liab:seller_payable:*`, `asset:pg_receivable:*`; 하한 없음 — `fx:clearing:*`, `exp:*`, `rev:*`, `asset:payout_marked:*`. 한 분개가 여러 계정을 갱신할 때는 계정 id 오름차순으로 갱신한다(락 순서). 확정 보상은 역분개하지 않으므로(ADR-037) 사용자 포인트 잔액이 음수가 되는 경로가 없다. 공개 `InTx` 시그니처는 `(tx: TxContext, …) => Result<…, LedgerError>`. 정산 후 환수는 M1 범위 밖.
6. **seller 역할은 없다**(P0 D11, 단일 판매자 = 운영자). 정산 대상 판매자 계정은 시드 데이터 1~2개이고 온보딩·KYC 는 없다. 정산 "지급"은 모의 표시.

## 설계 상세
계정 체계·대표 분개·대사 질의는 설계 문서 §9. 정산 실행은 외부 호출이 없어 선점→환산→완료 두 트랜잭션으로 충분하고, Phase 6-4 에서 온체인 호출이 두 트랜잭션 사이로 들어온다.

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

## 검증 방법
AC-C17~C19: 에스크로 동시 전이, 전 과정 재현, 분개 균형·시산표 0. 속성 시험(환산).

## 실서비스라면
법적 에스크로·정산 규정, 분쟁 SLA, 정산 주기, 회계 시스템 연동.

## 재검토 조건
P1 원장과 충돌할 때. 부분 환불/정산 후 환수 요구가 생길 때. 자동 확정 기한 조정이 필요할 때.

## 관련 ADR
ADR-011, ADR-016, ADR-021, ADR-025, ADR-026, ADR-038, ADR-039, ADR-041
