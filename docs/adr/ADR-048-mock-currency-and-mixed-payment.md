# ADR-048: 모의 통화(USDC·POINT) — 첫 로그인 지급, 단방향 교환, 혼합 결제, 선택적 Solana 지갑
- 상태: **Accepted** (2026-11-05, 사용자 일괄 확정 U1. 아래 결정 중 E1·E2·E3·E6 은 사용자가 2026-11-04 대화에서 정한 값이고, 나머지는 그 결정을 구현 가능하게 만든 제안이다. 본문의 `E1`~`E8` 은 **이 ADR 의 결정 번호**이며 phases/00 §2.4 의 CQRS 예외 `X1`·`X2` 와 무관하다)
- 날짜: 2026-11-04
- 근거: 사용자 결정(2026-11-04: "자산은 USDC", 첫 로그인 USDC 10,000 + POINT 1,000(당초 안; 2026-11-05 에 원장 지급을 POINT 1,000 만으로 개정, 같은 날 개정 2 에서 POINT 100,000 으로 상향 — E1·U24·U27), 혼합 결제 = 포인트 우선 차감 후 USDC, Solana 지갑은 선택) / ADR-011(정산 통화 USDC)·ADR-015(모의 면책)·ADR-037(포인트 원장)·ADR-040(원장·정산)·ADR-041(시세·견적) / 로컬 검산 스크립트(아래 "검산")
- 관련 문서: [phases/02-commerce](../design/phases/02-commerce.md) §6.1.1·§6.6.1·§7.1·§8.2.1·§8.5.1·§9.1~§9.3, [phases/00](../design/phases/00-platform-evolution.md) §1.4 G1·G3·G15, §7.3, §16 U24~U29

## 맥락
기존 설계에서 USDC 는 **판매자 정산 통화**일 뿐 구매자가 보유하는 자산이 아니었고, POINT 는 바둑 보상으로만 생기는 재화였다. 구현 순서가 바뀌어 바둑이 맨 마지막이 되면서(D24) 타임딜이 쓸 포인트의 출처가 없어졌다. 사용자는 이를 다음처럼 풀기로 했다: 구매자도 **모의 USDC 를 보유**하고, **포인트**는 별도의 플랫폼 크레딧으로 물건을 살 수 있으며, 실제 Solana 지갑은 **선택 사항**(연결하면 devnet 에스크로 시연)이다.

## 결정
- **E1 첫 로그인 지급**: GitHub 로그인한 사용자가 처음 지급을 청구하면 **POINT 100,000** 을 **1회** 받는다(익명 세션은 지급 없음, 사용자당 1회; 당초 안은 모의 USDC 10,000 + POINT 1,000, 2026-11-05 개정 1 에서 POINT 1,000 만으로, 같은 날 **개정 2 에서 100,000 으로 상향** — U27). USDC 는 원장에서 고정액으로 자동 지급하지 않고 테스트넷 환경에 따라 공급한다 — 설정 `WELCOME_GRANT_USDC_MICRO`(환경별: 로컬·시험은 시험용 값, 라이브 기본 0), 지갑을 연결한 사용자는 Circle faucet 으로 본인이 받은 devnet USDC 를 쓰는 6d 경로. POINT 단독 결제도 가능하며 혼합 결제·교환 설계는 유지한다. **Phase 3 범위(2026-11-05 사용자 결정 D1)**: Phase 3 은 **POINT 단독 결제로 DoD 를 닫는다**. USDC 다리·USDC→POINT 교환·혼합 결제 코드는 Phase 3 에 만들고 로컬·시험 환경(`WELCOME_GRANT_USDC_MICRO > 0`)에서 시연하되, **라이브 노출은 6d 의 devnet 입금→원장 반영 브리지(`UsdcDepositBridge`)가 생긴 뒤**다(설정 `USDC_LEG_ENABLED`, 라이브 기본 off — 그 전 라이브에는 `liab:user_usdc` 의 출처가 없다). 라이브에서 100,000원을 넘는 상품은 숨기거나 'USDC 입금 후 구매 가능'으로 표기한다. U24(원장 USDC 고정 지급 없음)·U26(교환 무제한)은 그대로다. 하위 질문(지갑 없는 라이브 사용자에게 USDC 를 어떻게 줄 것인가)은 **해결(2026-11-05 사용자 결정): '지갑이 없으면 애초에 연결하지 못하니(=USDC 를 받을 수 없으니) 지갑 연결을 유도하고, 지갑 없는 사용자에게는 POINT 로 물건을 구매하는 경험을 준다.'** ① 지갑 없는 사용자는 USDC 를 받지 않는다(원장 USDC 지급·관리자 지급·USDC 지급액 상향은 채택하지 않음; POINT 지급액 상향은 U27 (c) 로 채택) ② 화면에서 지갑 연결을 안내·유도한다(연결하면 devnet USDC 경로 6d) ③ POINT 단독 결제가 지갑 없는 사용자의 핵심 구매 경험이므로 시드 상품 중 POINT 100,000 안에서 살 수 있는 상품이 다수 있어야 한다(U27, 아래 시드 상품). 유일성은 `ledger.grant` 에 사본으로 둔 **불변 `github_id`** 의 `UNIQUE (github_id, kind)` 가 강제하고(사용자 삭제는 소프트 삭제=톰스톤이라 재가입으로 다시 받을 수 없다), 분개 멱등 키는 자산별 `grant:welcome:{userId}:{asset}` 이다.
- **E2 포인트 출처**: ① 첫 로그인·관리자 지급(데모) ② 바둑 보상(마지막 구현, 두 번째 출처) ③ **USDC→POINT 단방향 교환**. POINT→USDC 환전은 **없다**(플랫폼 크레딧).
- **E3 혼합 결제**: 상품 가격은 KRW. 주문 합계에서 **POINT 를 먼저 차감**(1 POINT = 1 KRW, `POINT_KRW_RATE` 는 **1:1 고정**이며 설정 항목이 아니다, `usePoints` 토글, 기본 켜짐)하고 남는 KRW 몫을 **결제 시작 시 고정한 시세 스냅샷**으로 USDC 환산해 낸다. 카드(테스트) 결제는 단일 KRW 다리로 별개 수단이며 포인트와 섞지 않는다.
- **E4 환불**: **다리(leg)별로 원래 자산으로** 돌려준다. POINT 는 POINT 로, USDC 는 **낸 USDC 수량 그대로**(새 환율로 재환산하지 않음). 부분 환불은 다리별 KRW 가치 비례 + 나머지는 USDC 다리 귀속의 결정적 규칙.
- **E5 에스크로·정산**: 에스크로가 다리별로(`liab:escrow:POINT`·`liab:escrow:USDC`) 보류하고 한 주문으로 묶는다. 해제 시 **판매자 정산은 USDC**(부분 환불이 있었으면 **잔여 다리**가 정산 입력이다: `gross_rem = max(floor(T_rem·10¹⁴/rate), u_rem)`, `r = gross_rem − u_rem ≥ 0`, ADR-040 결정 4). Phase 3 의 에스크로는 hold / release / refund 의 최소형이고 분쟁·동결·정산은 Phase 5. POINT 다리의 가치는 결제 시작 스냅샷으로 USDC 환산해 **플랫폼이 부담**(`exp:point_redemption:USDC`)한다.
- **E6 Solana 지갑은 선택**: `identity.wallet_link` 로 서명 챌린지를 통과한 공개키를 연결한다. 지갑 없이도 POINT 단독 구매가 된다(라이브에서 USDC 다리가 필요한 구매는 D1 에 따라 6d 브리지 전까지 막힌다). 연결한 사용자만 devnet 에스크로 시연(소액)을 체험한다. **원장의 모의 USDC 잔액은 온체인이 아니다** — 6d 의 `UsdcDepositBridge` 가 연결 지갑의 devnet 입금을 원장에 반영하는 유일한 라이브 출처다.
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
| `asset:payout_marked:USDC` | 자산 | USDC | 없음 | 모의 지급 표시(정산 지급 완료 처리) |
| `liab:seller_payable:{sid}:USDC` · `rev:platform_fee:USDC` · `rev:rounding_dust:USDC` | 부채·수익 | USDC | 지급채무 0 / 수익 없음 | 정산 |

하한(`min_balance`)의 정본은 [ADR-040](ADR-040-escrow-settlement-and-ledger.md) 결정 5 한 곳이다(`liab:user_usdc:*` 포함).

### 환산 규칙 (정수 연산, `rate_e8` = KRW/USDC ×10⁸, 임의 정밀도)
```
buyerUsdcMicro(R)  = floor( R × 10^14 / rate_e8 )                       // 구매자 USDC 다리 — 내림(구매자에게 불리하지 않음)
sellerGrossMicro(T)= floor( T × 10^14 / rate_e8 )                       // 정산 총액 (T = 주문 KRW 합계)
pointRedemption r  = sellerGrossMicro(T) − buyerUsdcMicro(T − P)        // 플랫폼 부담, 항상 ≥ 0
exchangeCost(K)    = ceil( K × 10^14 / rate_e8 )                        // 포인트 K 를 사는 데 드는 USDC — 올림
```
- 구매자 다리 **내림**과 교환 **올림**은 방향이 다르지만 일관된다: 교환 경로 비용 `ceil(K·c) ≥ floor(K·c)` = 직접 USDC 로 K 원어치를 내는 비용이므로 **같은 스냅샷에서 교환 후 포인트로 사는 것이 직접 USDC 로 사는 것보다 싸지 않다**(**같은 스냅샷 한정**: 같은 시세 스냅샷 안에서는 차익이 없고 차이 ≤ 1 micro-USDC. 스냅샷이 다르면 시세 이동으로 차익이 생길 수 있어 교환 견적 만료·상한으로 제한한다).
- 정산 총액·수수료·dust 는 ADR-040 의 기존 정의 그대로(`net`·`fee` 각각 floor, `dust = gross − net − fee ∈ {0,1}`).

### 첫 로그인 지급 (E1)
- `ClaimWelcomeGrant`(ledger usecase, `POST /api/ledger/welcome-grant`, 로그인 필요): 한 트랜잭션에서 자산별 분개(POINT 1건, `WELCOME_GRANT_USDC_MICRO` > 0 인 환경에서만 USDC 1건 추가; 저널 키 `grant:welcome:{userId}:{asset}`)을 기장하고 `ledger.grant` 행(`UNIQUE (github_id, kind)`)을 만든다. 이미 받았으면 **같은 응답을 재생**(멱등). 지급은 사용자 생성 tx 와 분리된 **멱등 별도 tx** 다(로그인 직후 웹앱이 호출하고 기존 사용자도 같은 경로를 쓰므로 생성 tx 에 묶을 수 없다). 발행 이벤트 `ledger.demo_granted` 는 **자산별 1건**(asset 단수)이고 outbox 로 같은 tx 에서 발행한다.
- 웹앱이 로그인 직후 한 번 자동 호출한다(M1 이벤트 변경 없이 기존 사용자도 같은 경로로 받는다). 금액은 설정(`WELCOME_GRANT_POINT=100000`, `WELCOME_GRANT_USDC_MICRO` — 환경별 값: 로컬·시험은 시험용 값, 라이브 기본 0).
- 총 발행 상한은 **가능한 최대치**다(U25 확정, 2026-11-05): `ledger.supply_cap(asset, issued, cap)` 의 `cap` 은 `numeric(40,0)` 이고 값은 signed 64-bit 최대 9223372036854775807(마이크로 단위; 각 잔액 컬럼이 BIGINT 인 한 합이 이를 넘을 수 없다). **원자 UPDATE 구조(`UPDATE … SET issued = issued + :amt WHERE issued + :amt <= cap`, T8)는 구조 방어로 유지**하며 교환으로 발행되는 POINT 도 같은 행에 포함하지만 실질 무제한이다. 남용 방어는 사용자당 1회 지급(`github_id` 유일)과 속도 제한이 맡는다. 재충전은 **하지 않는다**(관리자 CLI 지급만, 사용자 결정 U24).

### 교환 (E2)
- `ExchangeUsdcToPoint(K)`(ledger usecase, `POST /api/ledger/exchange`): 클라이언트 `Idempotency-Key` 필수(저널 키 `exchange:{userId}:{key}:{asset}`), 요청에 상한 `maxUsdcMicro` 와 주문과 무관한 `exchange_quote`(userId, snapshotId, 만료)를 싣는다. 서버는 `x = exchangeCost(K)` 가 `maxUsdcMicro` 를 넘거나 견적이 만료되면 `price_moved`/`quote_expired` 로 거절한다. 통과하면 한 트랜잭션에서 USDC 분개(사용자 → `rev:point_exchange:USDC`)와 POINT 분개(`exp:points_exchanged:POINT` → 사용자)를 기장한다. 반대 방향 API·usecase 는 **만들지 않는다**. 최소 단위 1 POINT, 교환 금액 한도는 없다(U26 확정: 무제한 — 일일·건당 상한 삭제; 잔액 부족 검사·견적 만료·`maxUsdcMicro` 보호는 유지). 속도 제한 등급 `write.exchange`(P2 §16.2 표에 정의; 남용 방어이며 한도가 아니다)는 적용하고, 성공 시 `ledger.points_exchanged` 를 outbox 로 발행한다.

### 혼합 결제 (E3) — 요약 (상세 P2 §6.1.1)
1. 결제 시작(`InitiatePayment`): 최신 accepted 스냅샷을 `payment.snapshot_id` 로 고정, 포인트 잔액 `b` 로 `P = usePoints ? min(b, T) : 0`, `R = T − P`, `u = buyerUsdcMicro(R)` 를 계산해 `payment_leg` 계획 행을 만들고, 응답에 `{P, u, rate, snapshotId}` 를 담아 구매자가 확인한 뒤 확정한다.
2. 구매 확정(`ConfirmPurchase`, B12 쌍 #3): 같은 트랜잭션에서 POINT 분개(사용자 → `liab:escrow:POINT`)와 USDC 분개(사용자 → `liab:escrow:USDC`)를 자산별 1건·키 접미 `:{asset}` 로 `PostJournalsInTx` **한 번에**(두 저널의 계정을 일괄 잠금, P0 R10) 기장하고, **같은 tx 에서 `escrow` 행을 만든다**(최소 escrow, 쌍 #5 Phase 3 활성). 락 순서는 ADR-040 결정 5 의 전역 순서다. 어느 쪽 `account_balance` 조건부 갱신이 실패해도 **전체 롤백**(예약 유지, `insufficient_funds`).
3. 에스크로 `held` 는 다리 행(`escrow_leg`)을 갖는다.

### 환불 (E4) — 요약 (상세 P2 §6.6.1)
다리별 KRW 가치를 누적 추적한다(다리별 환불 행은 자산별 멱등 키 `refund:{paymentId}:{eventId}:{asset}` 를 가지며, `R=0` 인 포인트 단독 결제의 환불은 USDC 다리를 건너뛴다. 부분 환불 역분개의 합은 원 분개를 넘지 못한다). 환불 `F`(KRW)는 `pk = min(P_rem, ⌊F·P_rem / T_rem⌋)` 를 POINT 다리에, `F − pk` 를 USDC 다리 KRW 몫에 배정(USDC 다리 잔여를 넘으면 초과분을 POINT 다리로)하고, USDC 환불 수량은 **누적 기준** `⌊R_done · u / R⌋` 의 증분이다. 따라서 전액 환불은 낸 수량을 정확히 되돌리고 어떤 부분 환불 순서에서도 다리별 환불 합이 낸 금액을 넘지 않는다.

### 선택적 Solana 지갑 (E6)
- 연결: `POST /api/me/wallet/challenge`(nonce·도메인·만료 5분, 사용자 바인딩) → 지갑이 메시지 서명 → `POST /api/me/wallet/link {publicKey, signature}`. 서버는 ed25519 서명을 검증한다(로컬 실측: Bun 에서 `node:crypto` 와 WebCrypto 의 Ed25519 모두 검증 통과·변조 거부). 공개키는 32바이트(base58 표기), **공개키 하나는 한 사용자에게만**, 해제 가능.
- 지갑 없이도 모든 구매·교환이 가능하다. 지갑은 **Phase 6d 의 소액 devnet 에스크로 시연**에만 필요하다.
- **온체인 시연 토큰 (U28, 확정 2026-11-05)**: **자체 발행 `tUSDC`(devnet 모의 토큰)를 기본**으로 하고, 설정 `SETTLEMENT_MINT` 로 Circle devnet USDC(`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)에 연결할 수 있다.

| 방안 | 장점 | 단점 |
|---|---|---|
| A. Circle devnet USDC (`SETTLEMENT_MINT` 로 선택) | 진짜 devnet USDC 민트(Circle 문서 developers.circle.com/stablecoins/usdc-contract-addresses; Circle faucet 과 Coinbase CDP faucet 이 같은 민트로 보낸다 — 2026-11-05 검색) | 파우셋 한도(재확인 필요: 제3자 자료 기준 Circle 20 USDC/2시간/주소 — Circle 자체 페이지 미확인; Coinbase CDP 1 USDC/요청·10 USDC/24시간 — Coinbase 문서). 이전 확인 기록: 공개 파우셋 **요청당 10 USDC, 토큰·테스트넷당 24시간 1회**, 개발자 콘솔 파우셋 **요청당 20 USDC, 계정당 24시간 10회**([Circle 공식 문서](https://developers.circle.com/wallets/developer-console-faucet), 구현 시 재확인). 방문자가 외부 faucet 을 직접 거쳐야 해 시연 마찰이 크다 |
| B. 자체 발행 모의 토큰 `tUSDC` (**기본**) | 한도 없음, 사이트가 연결된 지갑에 발행해 주고 수수료를 대납해 마찰 최소 | **진짜 USDC 가 아니다** — 화면·메타데이터에 명시해야 한다 |

  **결정(2026-11-05 사용자 확정)**: 기본은 **B(`tUSDC`)**, `SETTLEMENT_MINT` 를 Circle devnet USDC 민트로 바꾸면 A 로 연결된다. 이유: 지갑 연결이 유도 경로(U24)이므로 외부 faucet(Circle, Coinbase CDP) 두 곳을 거치게 하면 방문자가 이탈한다. 그래서 사이트가 tUSDC 를 발행해 주고 devnet SOL 수수료는 사이트가 대납(fee payer)한다. 요구 사항:
  - 토큰 메타데이터 이름은 **'Test USDC (demo)'** 이고 화면에도 항상 `tUSDC` 로 표기해 진짜 USDC 와 오인되지 않게 한다.
  - **민트 권한 키와 수수료 대납 키는 비밀**이다(devnet 전용, 메인넷 키 금지) — [ADR-026](ADR-026-data-protection.md) 비밀 관리 대상으로 등재하고 `_FILE` 시크릿 파일·로그 마스킹을 적용한다.
  - **지갑당 발행 속도·횟수를 제한**한다(수수료 대납 키 잔액 고갈과 발행 남용 방어).
  - **수수료 대납 안전장치(U29, 확정 2026-11-05)**: ① 지갑당 대납 횟수·일일 총량 상한 ② 대납 키 SOL 잔액이 기준 이하이면 Discord 경보([ADR-027](ADR-027-server-logs.md) 경로, 게이지 `pf_wallet_fee_payer_balance_lamports` 제안) ③ 잔액이 바닥나면 대납을 멈추고 '사용자 faucet 안내' 화면으로 자동 폴백(지갑 연결·원장 기능은 정상). 사용자 1명당 약 0.003 SOL 은 미검증 추정(서명당 약 5,000 lamports, 토큰 계정 임대료 약 0.002 SOL — 6d 착수 전 재확인)이고 상한 숫자는 초기값 제안으로 6d 착수 시 확정한다. devnet SOL faucet 의 한도는 미확인이다.
  - `SETTLEMENT_MINT` 가 Circle USDC 일 때는 **사이트가 발행하지 않는다**(민트 권한이 Circle 에 있다). 사용자가 Circle faucet 으로 받은 것을 쓰고, 수수료 대납은 유지할 수 있다.
  - 개정 이력: 같은 날 앞서 '권고는 A(Circle devnet USDC), 한도가 막을 때만 B 폴백'으로 적었으나 사용자 확정으로 기본과 폴백이 뒤집혔다(A 는 폴백이 아니라 설정으로 고르는 대체 경로).

### 시드 상품 (U27)
- 실제 쇼핑몰(네이버 쇼핑 등)에서 대표 상품을 조사해 **참고 가격을 표시**한다. `catalog.product` 에 `reference_price_krw`·`reference_source`(출처 이름)·`reference_checked_on`(확인일)을 둔다. 자동 수집(스크래핑)은 하지 않고 사람이 Phase 3 착수 시 조사해 `seeds/products.*` 에 기록한다. 실제 가격 수치는 아직 확보하지 못했으므로 문서에 쓰지 않는다.
- 이미지는 쇼핑몰 것을 복사하지 않는다(저작권·약관) — 자체 일러스트 또는 무이미지. 가격은 시점 스냅샷이며 실제 거래가 아님을 화면에 표기한다.
- **지갑 없는 사용자는 USDC 를 받지 않으므로(U24 해결) POINT 단독 구매가 핵심 경험이고, 시드 상품 중 POINT 100,000 안에서 살 수 있는 상품이 다수 있어야 한다.** **시드 상품은 대략 현실 금액(조사한 참고가 그대로)을 쓰고, 참고가 대부분이 100,000원 이하가 되도록 조사한다.** 100,000원을 넘는 상품은 USDC 교환·혼합 결제를 시연하는 대상으로 둔다(로컬·시험 환경; 라이브는 6d 브리지 전까지 숨김 또는 'USDC 입금 후 구매 가능' 표기, D1).
- **가격 충돌은 해결(2026-11-05 사용자 결정): (c) 로 푼다** — 첫 로그인 POINT 지급을 1,000 → **100,000**(1 POINT = 1 KRW, 100,000 POINT = 100,000 KRW)으로 올리고 시드 상품은 **대략 현실 금액(참고가 그대로)** 을 쓴다. 폐기한 안: (a) 참고가 스케일링, (b) 소액 상품군 필수 포함(소액 상품을 넣는 것은 자유). 시드 상품은 참고가 대부분이 100,000원 이하가 되도록 조사하고, 100,000원을 넘는 상품은 USDC 교환·혼합 결제의 시연 대상으로 둔다. 총 발행 상한(U25)은 이미 최대치라 그대로다.

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

위 시험은 순수 정수 모델이다. DB 통합 시험(지연 제약 트리거, 동시 확정)은 구현 단계에서 한다. 스크립트는 저장소에 두지 않았으므로 **검산 벡터(P2 §8.5.1 V1~V4)를 시험 픽스처로 커밋**하고 무작위 시험은 시드를 고정한다(2026-11-05 3차 검토 C11). 정산 `net`·`fee` 는 유리수 `x_eff` 에서 한 번 내린다(ADR-040 결정 4 정정).

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
| 실제 시장 가격(수만 원대)이 지급 POINT 로 모자랄 수 있다 | 지급을 100,000 POINT 로 올리고 시드는 참고가 그대로 쓴다(U27 (c) 확정). 100,000 POINT 안의 시드 상품이 다수 있어야 하고, 그 이상 상품은 USDC 교환·혼합 결제 시연용. 지갑 연결 안내로 USDC 경로(6d) 유도. 모든 화면 "모의" |
| 가입 농사(여러 GitHub 계정으로 반복 수령) | GitHub 계정당 1회 + 총 발행 상한 + 경보(지급 한도). 완전 방어는 아님(GitHub 계정 생성은 무료) |
| 다리 환불·정산의 반올림 누적 오차 | 누적 기준 환불 규칙, 속성 기반 시험, 대사 질의 |
| 환율 변동으로 포인트 몫 정산 비용이 달라짐 | 결제 시작 시 스냅샷 고정, 플랫폼 부담분은 `exp:point_redemption` 으로 가시화 |
| 온체인 시연을 사용자가 실제 USDC 로 오해 | 화면·README 에 devnet·모의 표기, 기본 `tUSDC` 는 메타데이터 이름 'Test USDC (demo)'·화면 `tUSDC` 표기로 명시 |

## 검증 방법
- 속성 기반 시험: 무작위 혼합 결제·부분 환불·해제 수만 건에서 자산별 시산표 0 (P2 §19).
- 통합: 지급·교환·결제 확정이 지연 제약 트리거와 조건부 잔액 갱신을 지나며 동시 요청에서 음수 잔액이 없음.
- 계약: 지갑 챌린지 재사용·만료·다른 사용자 서명 거절.

## 재검토 조건
첫 로그인 지급 남용이 실제로 발생할 때. 혼합 결제의 정합성 시험이 일정에 부담이 될 때(단일 수단으로 축소). 실제 devnet USDC 연동 요구가 생길 때.

## 관련 ADR
ADR-011, ADR-015, ADR-037, ADR-038, ADR-039, ADR-040, ADR-041
