# ADR-048: 모의 통화(USDC·POINT) — 첫 로그인 지급, 단방향 교환, 혼합 결제, 선택적 Solana 지갑
- 상태: **Proposed** (사용자 확정 대기. 아래 결정 중 E1·E2·E3·E6 은 사용자가 2026-11-04 대화에서 정한 값이고, 나머지는 그 결정을 구현 가능하게 만든 제안이다)
- 날짜: 2026-11-04
- 근거: 사용자 결정(2026-11-04: "자산은 USDC", 첫 로그인 USDC 10,000 + POINT 1,000, 혼합 결제 = 포인트 우선 차감 후 USDC, Solana 지갑은 선택) / ADR-011(정산 통화 USDC)·ADR-015(모의 면책)·ADR-037(포인트 원장)·ADR-040(원장·정산)·ADR-041(시세·견적) / 로컬 검산 스크립트(아래 "검산")
- 관련 문서: [phases/02-commerce](../design/phases/02-commerce.md) §6.1.1·§6.6.1·§7.6·§8.2.1·§8.5.1·§9.4, [phases/00](../design/phases/00-platform-evolution.md) §1.4 G1·G3·G15, §7.3, §16 U24~U29

## 맥락
기존 설계에서 USDC 는 **판매자 정산 통화**일 뿐 구매자가 보유하는 자산이 아니었고, POINT 는 바둑 보상으로만 생기는 재화였다. 구현 순서가 바뀌어 바둑이 맨 마지막이 되면서(D24) 타임딜이 쓸 포인트의 출처가 없어졌다. 사용자는 이를 다음처럼 풀기로 했다: 구매자도 **모의 USDC 를 보유**하고, **포인트**는 별도의 플랫폼 크레딧으로 물건을 살 수 있으며, 실제 Solana 지갑은 **선택 사항**(연결하면 devnet 에스크로 시연)이다.

## 결정
- **E1 첫 로그인 지급**: GitHub 로그인한 사용자가 처음 지급을 청구하면 **모의 USDC 10,000 + POINT 1,000** 을 **1회** 받는다(익명 세션은 지급 없음, 사용자당 1회, 멱등 키 `grant:welcome:{userId}`).
- **E2 포인트 출처**: ① 첫 로그인·관리자 지급(데모) ② 바둑 보상(마지막 구현, 두 번째 출처) ③ **USDC→POINT 단방향 교환**. POINT→USDC 환전은 **없다**(플랫폼 크레딧).
- **E3 혼합 결제**: 상품 가격은 KRW. 주문 합계에서 **POINT 를 먼저 차감**(1 POINT = 1 KRW, `usePoints` 토글, 기본 켜짐)하고 남는 KRW 몫을 **결제 시작 시 고정한 시세 스냅샷**으로 USDC 환산해 낸다. 카드(테스트) 결제는 단일 KRW 다리로 별개 수단이며 포인트와 섞지 않는다.
- **E4 환불**: **다리(leg)별로 원래 자산으로** 돌려준다. POINT 는 POINT 로, USDC 는 **낸 USDC 수량 그대로**(새 환율로 재환산하지 않음). 부분 환불은 다리별 KRW 가치 비례 + 나머지는 USDC 다리 귀속의 결정적 규칙.
- **E5 에스크로·정산**: 에스크로가 다리별로(`liab:escrow:POINT`·`liab:escrow:USDC`) 보류하고 한 주문으로 묶는다. 해제 시 **판매자 정산은 USDC**. POINT 다리의 가치는 결제 시작 스냅샷으로 USDC 환산해 **플랫폼이 부담**(`exp:point_redemption:USDC`)한다.
- **E6 Solana 지갑은 선택**: `identity.wallet_link` 로 서명 챌린지를 통과한 공개키를 연결한다. 지갑 없이도 모든 구매가 된다. 연결한 사용자만 devnet 에스크로 시연(소액)을 체험한다. **10,000 USDC 는 원장 모의 잔액이며 온체인이 아니다.**
- **E7 남용 방어**: 지급은 로그인 사용자·사용자당 1회·총 발행 상한(경보), 교환·지급에 전용 속도 제한 등급, 모든 금액에 "모의" 표시.
- **E8 Phase 3 에 최소 `pricefeed`**: USDC 다리는 환율이 필요하므로 Phase 3 에서 **고정 환율 소스**(`FixedRateSource`, 설정 `DEMO_USDC_KRW_RATE_E8`)로 스냅샷을 만든다. Phase 5 가 실제 시세 소스와 검증기를 같은 수집기에 붙인다(P0 §1.4 G3 개정).

## 설계 상세

### 자산과 계정 (원장 단일 모듈, 분개는 자산별 차변=대변)
| 계정 | 유형 | 자산 | 하한 | 의미 |
|---|---|---|---|---|
| `liab:user_points:{uid}` | 부채 | POINT | 0 | 사용자 포인트 |
| `liab:user_usdc:{uid}` | 부채 | USDC | 0 | 사용자 **모의** USDC |
| `exp:demo_grant:POINT` · `exp:demo_grant:USDC` | 비용 | POINT·USDC | 없음 | 데모 지급(첫 로그인·관리자) 발행분 |
| `exp:points_exchanged:POINT` | 비용 | POINT | 없음 | 교환으로 발행한 포인트 |
| `rev:point_exchange:USDC` | 수익 | USDC | 없음 | 교환에 소비된 USDC |
| `liab:escrow:POINT` · `liab:escrow:USDC` (· `liab:escrow:KRW`) | 부채 | 각 자산 | 0 | 에스크로 보류 |
| `fx:clearing:POINT` | 자산 | POINT | 없음 | 해제된 포인트의 소각 청산 |
| `exp:point_redemption:USDC` | 비용 | USDC | 없음 | POINT 다리 몫을 USDC 로 정산하며 플랫폼이 부담한 값 |
| `liab:seller_payable:{sid}:USDC` · `rev:platform_fee:USDC` · `rev:rounding_dust:USDC` | 부채·수익 | USDC | 지급채무 0 / 수익 없음 | 정산 |

### 환산 규칙 (정수 연산, `rate_e8` = KRW/USDC ×10⁸, 임의 정밀도)
```
buyerUsdcMicro(R)  = floor( R × 10^14 / rate_e8 )                       // 구매자 USDC 다리 — 내림(구매자에게 불리하지 않음)
sellerGrossMicro(T)= floor( T × 10^14 / rate_e8 )                       // 정산 총액 (T = 주문 KRW 합계)
pointRedemption r  = sellerGrossMicro(T) − buyerUsdcMicro(T − P)        // 플랫폼 부담, 항상 ≥ 0
exchangeCost(K)    = ceil( K × 10^14 / rate_e8 )                        // 포인트 K 를 사는 데 드는 USDC — 올림
```
- 구매자 다리 **내림**과 교환 **올림**은 방향이 다르지만 일관된다: 교환 경로 비용 `ceil(K·c) ≥ floor(K·c)` = 직접 USDC 로 K 원어치를 내는 비용이므로 **교환 후 포인트로 사는 것이 직접 USDC 로 사는 것보다 싸지 않다**(차익 거래 없음, 차이 ≤ 1 micro-USDC).
- 정산 총액·수수료·dust 는 ADR-040 의 기존 정의 그대로(`net`·`fee` 각각 floor, `dust = gross − net − fee ∈ {0,1}`).

### 첫 로그인 지급 (E1)
- `ClaimWelcomeGrant`(ledger usecase, `POST /api/ledger/welcome-grant`, 로그인 필요): 한 트랜잭션에서 두 분개(POINT·USDC)를 기장하고 `ledger.grant` 행(`UNIQUE (user_id, kind)`)을 만든다. 이미 받았으면 **같은 응답을 재생**(멱등).
- 웹앱이 로그인 직후 한 번 자동 호출한다(M1 이벤트 변경 없이 기존 사용자도 같은 경로로 받는다). 금액은 설정(`WELCOME_GRANT_USDC_MICRO=10000000000`, `WELCOME_GRANT_POINT=1000`).
- 총 발행 상한(`LEDGER_DEMO_SUPPLY_CAP_USDC_MICRO`, `…_POINT`, 제안: USDC 1억 / POINT 1천만)을 넘으면 신규 지급을 거절하고 경보. 재충전은 **하지 않는다**(관리자 CLI 지급만, 사용자 결정 U24).

### 교환 (E2)
- `ExchangeUsdcToPoint(K)`(ledger usecase, `POST /api/ledger/exchange`, 견적 사용): 최신 accepted 스냅샷으로 `x = exchangeCost(K)` 를 계산하고 한 트랜잭션에서 USDC 분개(사용자 → `rev:point_exchange:USDC`)와 POINT 분개(`exp:points_exchanged:POINT` → 사용자)를 기장한다. 반대 방향 API·usecase 는 **만들지 않는다**. 최소 단위 1 POINT, 건당·일일 한도는 속도 제한 등급(`write.exchange`).

### 혼합 결제 (E3) — 요약 (상세 P2 §6.1.1)
1. 결제 시작(`InitiatePayment`): 최신 accepted 스냅샷을 `payment.snapshot_id` 로 고정, 포인트 잔액 `b` 로 `P = usePoints ? min(b, T) : 0`, `R = T − P`, `u = buyerUsdcMicro(R)` 를 계산해 `payment_leg` 계획 행을 만든다.
2. 구매 확정(`ConfirmPurchase`, B12 쌍 #3): 같은 트랜잭션에서 POINT 분개(사용자 → `liab:escrow:POINT`)와 USDC 분개(사용자 → `liab:escrow:USDC`)를 기장한다. 어느 쪽 `account_balance` 조건부 갱신이 실패해도 **전체 롤백**(예약 유지, `insufficient_funds`).
3. 에스크로 `held` 는 다리 행(`escrow_leg`)을 갖는다.

### 환불 (E4) — 요약 (상세 P2 §6.6.1)
다리별 KRW 가치를 누적 추적한다. 환불 `F`(KRW)는 `pk = min(P_rem, ⌊F·P_rem / T_rem⌋)` 를 POINT 다리에, `F − pk` 를 USDC 다리 KRW 몫에 배정(USDC 다리 잔여를 넘으면 초과분을 POINT 다리로)하고, USDC 환불 수량은 **누적 기준** `⌊R_done · u / R⌋` 의 증분이다. 따라서 전액 환불은 낸 수량을 정확히 되돌리고 어떤 부분 환불 순서에서도 다리별 환불 합이 낸 금액을 넘지 않는다.

### 선택적 Solana 지갑 (E6)
- 연결: `POST /api/me/wallet/challenge`(nonce·도메인·만료 5분, 사용자 바인딩) → 지갑이 메시지 서명 → `POST /api/me/wallet/link {publicKey, signature}`. 서버는 ed25519 서명을 검증한다(로컬 실측: Bun 에서 `node:crypto` 와 WebCrypto 의 Ed25519 모두 검증 통과·변조 거부). 공개키는 32바이트(base58 표기), **공개키 하나는 한 사용자에게만**, 해제 가능.
- 지갑 없이도 모든 구매·교환이 가능하다. 지갑은 **Phase 6d 의 소액 devnet 에스크로 시연**에만 필요하다.
- **온체인 시연 토큰 (U28, 6d 착수 전 결정)**:

| 방안 | 장점 | 단점 |
|---|---|---|
| A. Circle devnet USDC | 진짜 devnet USDC 민트 | 파우셋 한도가 작다: 공개 파우셋 **요청당 10 USDC, 토큰·테스트넷당 24시간 1회**, 개발자 콘솔 파우셋 **요청당 20 USDC, 계정당 24시간 10회**([Circle 공식 문서](https://developers.circle.com/wallets/developer-console-faucet), 구현 시 재확인). 방문자가 직접 받아야 해 시연 마찰이 크다 |
| B. 자체 SPL 테스트 토큰(예 `tUSDC`) | 한도 없음, 플랫폼이 연결된 지갑에 소액 자동 지급, 마찰 최소 | **진짜 USDC 가 아니다** — 화면·문서에 명시해야 한다 |

  제안: **B 를 기본**(방문자 경험 우선), A 는 설정으로 전환 가능한 옵션. 수수료용 devnet SOL 은 플랫폼이 수수료 대납자로 서명하는 방식을 검토(미검증).

### 검산 (로컬 스크립트, 임의 정밀도)
| 항목 | 결과 |
|---|---|
| 포인트만 결제 (`T=50,000`, `P=50,000`, 환율 1,387.654321, 수수료 250bps) | gross 36,032,028 = `exp:point_redemption` 차변 36,032,028 = net 35,131,227 + fee 900,800 + dust 1 ✓ (POINT 분개 50,000/50,000 ✓) |
| 혼합 결제 (`T=1,000,000`, `P=300,000`, 환율 1,400, 수수료 100bps) | 구매자 USDC `u`=500,000,000(500 USDC), gross 714,285,714, `r`=214,285,714, 차변 `escrow 500,000,000 + point_redemption 214,285,714` = 대변 `net 707,142,857 + fee 7,142,857 + dust 0` ✓ |
| 교환 (50,000 POINT, 환율 1,387.654321) | 교환 비용 36,032,029 micro-USDC vs 직접 지불 36,032,028 — 교환이 1 micro-USDC 더 비쌈 |
| 무작위 정산 20만 건 (T 1천~500만, P 0~T, 환율 800~2,500, 수수료 {0,100,250,333}) | 자산별 차변≠대변 **0건**, `dust ∉ {0,1}` **0건**, `r < 0` **0건** |
| 교환 vs 직접 20만 건 | 교환이 더 싼 경우 **0건** |
| 무작위 부분 환불 29만 9천 단계(주문 10만 건, 1~5단계 후 잔액 전액 환불) | 다리별 환불 합 > 낸 금액 **0건**, 전액 환불 시 낸 수량과 불일치 **0건** |
| 부분 환불 예 (혼합 예시 주문에서 100,000 KRW 환불) | POINT 30,000 + USDC 50,000,000 (USDC 다리 KRW 몫 70,000); 이어서 잔여 900,000 환불 → POINT 270,000 + USDC 450,000,000, 누적 USDC 환불 500,000,000 = 낸 수량 |

위 시험은 순수 정수 모델이다. DB 통합 시험(지연 제약 트리거, 동시 확정)은 구현 단계에서 한다.

## 대안과 기각 이유
- **혼합 결제 없음(한 수단만 선택)**: 정합성 증명이 가장 단순하지만 사용자가 혼합을 선택했다. 위험은 아래에 정리했다.
- **POINT↔USDC 양방향 교환**: 환전 차익·인플레이션 방어와 이중 기장 정책이 커지고, 포인트의 플랫폼 크레딧 성격이 흐려진다.
- **지갑 필수**: 방문자 대부분이 지갑이 없어 데모가 막힌다. 선택으로 둔다.
- **고정 교환 비율**: 단순하지만 스냅샷 환율과 어긋나면 직접 결제보다 싼 경로가 생겨 차익이 가능하다. 스냅샷 기준을 택했다.
- **구매자 USDC 다리 올림**: 플랫폼 손실은 없지만 구매자가 정확한 가치보다 더 낸다. 정산 총액(내림)과 방향을 맞춰 내림으로 통일했다.

## 결과
- 얻는 것: 바둑 없이도 타임딜 구매를 끝까지 시연, USDC·POINT 두 화폐의 원장 정합성 시험(속성 기반), 지갑 연결 서명 검증 시연.
- 치르는 것: 혼합 결제로 결제·환불·에스크로·정산의 상태와 시험이 늘고, Phase 3 에 최소 `pricefeed` 와 USDC 계정이 앞당겨진다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 큰 모의 잔액(10,000 USDC ≈ 환율에 따라 수천만 원 규모)으로 상품 가격 설정이 무의미해짐 | 상품 가격을 이 규모에 맞춰 시드하거나 지급액을 설정으로 조정. 모든 화면 "모의" |
| 가입 농사(여러 GitHub 계정으로 반복 수령) | GitHub 계정당 1회 + 총 발행 상한 + 경보(지급 한도). 완전 방어는 아님(GitHub 계정 생성은 무료) |
| 다리 환불·정산의 반올림 누적 오차 | 누적 기준 환불 규칙, 속성 기반 시험, 대사 질의 |
| 환율 변동으로 포인트 몫 정산 비용이 달라짐 | 결제 시작 시 스냅샷 고정, 플랫폼 부담분은 `exp:point_redemption` 으로 가시화 |
| 온체인 시연을 사용자가 실제 USDC 로 오해 | 화면·README 에 devnet·모의 표기, 자체 토큰이면 "테스트 토큰" 명시 |

## 검증 방법
- 속성 기반 시험: 무작위 혼합 결제·부분 환불·해제 수만 건에서 자산별 시산표 0 (P2 §19).
- 통합: 지급·교환·결제 확정이 지연 제약 트리거와 조건부 잔액 갱신을 지나며 동시 요청에서 음수 잔액이 없음.
- 계약: 지갑 챌린지 재사용·만료·다른 사용자 서명 거절.

## 재검토 조건
첫 로그인 지급 남용이 실제로 발생할 때. 혼합 결제의 정합성 시험이 일정에 부담이 될 때(단일 수단으로 축소). 실제 devnet USDC 연동 요구가 생길 때.

## 관련 ADR
ADR-011, ADR-015, ADR-037, ADR-038, ADR-039, ADR-040, ADR-041
