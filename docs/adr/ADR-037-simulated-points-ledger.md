# ADR-037: 모의 포인트 원장 — 복식·추가 전용, 보상은 PENDING 에서 확정·박탈로
- 상태: **Proposed** (사용자 확정 대기)
- 날짜: 2026-11-04
- 근거: ADR-009(보상 상태)·017(DB 규약)·021(동시성)·025(쓰기는 tx)·026(데이터 보호)·015(모의 면책)
- 구현 순서(P0 D24·D25): `ledger` 는 **Phase 3 에서 도입**된다(첫 로그인 지급·USDC→POINT 교환이 첫 포인트 출처, P0 §1.4 G1·[ADR-048](ADR-048-mock-currency-and-mixed-payment.md)). 이 ADR 의 바둑 보상은 구현 순서상 **마지막 출처**이며 `exp:points_issued` 계정으로 구분한다.
- **원장 정본**: 스키마(`account`·`journal`·`posting`·`account_balance`, 다중 자산, 지연 제약 트리거)는 [ADR-040](ADR-040-escrow-settlement-and-ledger.md)이 소유한다. 이 ADR 은 그 위의 **POINT 자산 규칙과 보상(`reward`) 상태 머신**만 정한다(P0 D20, [phases/00 §2.5](../design/phases/00-platform-evolution.md)).
- 관련 문서: [phases/01-baduk.md](../design/phases/01-baduk.md) §10~11

## 맥락
대국 보상은 "포인트"로 주지만 **모의**이며 실제 가치가 없다(ADR-015 면책). 그래도 나중 단계(상거래·결제)가 같은 원장 패턴을 쓰므로 정합성을 갖춘 구조로 만든다.

## 결정 (제안)
1. 원장은 **복식 기장, 추가 전용**이다(ADR-040): 모든 분개(`journal`)는 `posting` 의 **자산(`POINT`)별 차변 합 = 대변 합**이다. 수정·삭제 금지(DB 권한 + 트리거 + 시험). POINT 계정은 `liab:user_points:{uid}`(사용자 보유, `min_balance = 0`)와 `exp:points_issued`(발행처, 하한 없음)다.
2. 보상은 `reward` 상태 머신으로 관리한다: `PENDING → CONFIRMED / FLAGGED → (수동) CONFIRMED / REVOKED`. 보상 행은 **`ledger` 가 `game.finished` 를 소비해 `EligibilityPolicy`(ledger 소유; 입력은 `game.finished` 페이로드와 ledger 자신의 `reward` 표)로 판정한 뒤** 만들고 `reward.pending_created` 를 발행한다(분석은 이를 구독). 원장 **기장은 `CONFIRMED` 전이(`PENDING→CONFIRMED` 또는 `FLAGGED→CONFIRMED`)와 같은 트랜잭션**에서 일어난다 — 분석 완료 트랜잭션이 **`ledger.ConfirmRewardInTx` / `FlagRewardInTx`(`rewardId` 키, 색별 판정)** 를 호출하는 B12 허용 쌍 #6(`analysis`→`ledger`)이다. **`REVOKED` 는 `PENDING`/`FLAGGED` 의 무효화일 뿐 기장이 없으며, `CONFIRMED` 는 종결이다**(확정된 보상의 사후 역분개 경로는 두지 않음).
3. 분개는 **멱등 키**(`reward:{rewardId}:confirm`)로 한 번만 기장한다. 같은 이벤트 재전달·중복 분석에도 잔액이 한 번만 움직인다.
4. 잔액은 `ledger.account_balance`(같은 트랜잭션의 조건부 갱신, ADR-040)이며 표시용 사본 `ledger_read.balance_view` 는 이벤트로 갱신한다. 정합성 점검 잡이 `posting` 합계와 대조하고 불일치는 지표·경보.
5. 모든 화면과 API 에 **"모의 포인트, 실제 가치 없음"** 표기를 의무로 한다(ADR-015).
6. 보상 자격(어뷰징 방지)은 서버 규칙이고 **`ledger` 의 `EligibilityPolicy` 가 소유**한다(`game`(L3)은 `ledger`(L4)를 호출할 수 없으므로): 로그인 사용자 간 레이팅 대국, 최소 수 수, 일일 한도, 같은 상대 반복 한도. 입력은 `game.finished` 페이로드(레이팅 여부, 수 수, 종료 사유, 참가자 `userId`·로그인 여부)와 ledger 자신의 `reward` 집계다.

## 설계 상세
보상 상태 머신·시퀀스·점검 쿼리는 [phases/01-baduk.md](../design/phases/01-baduk.md) §10~11, 원장 테이블은 [phases/02-commerce.md](../design/phases/02-commerce.md) §9(ADR-040)가 정본이다.

## 대안과 기각 이유
- **단일 `balance` 컬럼 갱신**: 이력·감사·되돌리기가 어렵고 경합 시 정합성 문제.
- **이벤트 소싱만(원장 표 없이)**: 잔액 질의가 복잡. 복식 원장이 도메인 표준.
- **즉시 확정(분석 전)**: 부정 보상이 먼저 지급되고 되돌리기 어렵다. ADR-009 의 `PENDING` 단계를 유지.

## 결과
- 얻는 것: 감사 가능하고 되돌릴 수 있는 포인트, 후속 단계(결제·정산·에스크로)의 원장 패턴 재사용.
- 치르는 것: 분개·전기·보상 상태 3층 관리, 점검 잡, 모의 표기 의무.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 불균형 거래 | 트랜잭션 안에서 합계 0 검증 + 지연 제약/점검 잡 |
| 이중 지급 | 멱등 키 유일 제약, `reward` 상태 CAS |
| 박탈 후 잔액 음수 | **발생하지 않는다**: 기장은 `CONFIRMED` 전이와 같은 트랜잭션에서만 일어나므로 보류·박탈된 보상은 기장이 없고 `min_balance = 0` 과 충돌하지 않는다 |
| 실가치 오해 | 모의 표기 의무, POINT→외부 환전·출금 기능 없음(USDC→POINT 단방향 교환만, ADR-048) |

## 검증 방법
동시 확정 경합, 재전달 멱등, 불균형 주입 시 점검 잡 검출, REVOKED 는 기장 없음(합계 불변), `reward.pending_created` 이후에만 분석 작업이 생기는 순서, 색별 판정 전이.

## 실서비스라면
실제 결제 원장은 외부 PG 대사와 이중 승인, 규제 보고를 갖춘 별도 시스템으로 둔다.

## 재검토 조건
상거래 원장(ADR-038 계열)과 통합 요구가 생길 때. ("포인트 소비처가 생길 때"는 충족됨: 혼합 결제가 소비처이고 ADR-040·ADR-048 이 같은 원장 위에 정의한다.) 포인트의 외부 환전·출금 요구가 생길 때.

## 관련 ADR
ADR-009, ADR-015, ADR-017, ADR-021, ADR-025, ADR-026, ADR-036
