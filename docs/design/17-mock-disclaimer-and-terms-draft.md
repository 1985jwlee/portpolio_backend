# 17. 모의 면책·이용 약관·환불 정책 문구 초안 (U15)

> **법률 자문이 아니며 사용자 검토 전 초안이다.** 법무 검토 필요 항목: **개인정보 처리방침 법정 필수 기재 사항**, **통지 의무(A-027)**. 이 문서의 어떤 문구도 법령 조문이나 법적 효력을 단정하지 않는다.
> Not legal advice; a draft pending owner review. Items needing legal review: statutory mandatory contents of a privacy policy, and notification duties (A-027). Nothing here asserts statutes or legal effect.

사실 정본: 모의 면책 ADR-015 · 모의 표시 D18([phases/00](phases/00-platform-evolution.md)) · 모의 통화·지갑 ADR-048 · 개인정보 안내 구조 [12 §4](12-content.md)·FR-121([spec](../../specs/portfolio-site.spec.md)) · 보관 기간 U7 · 반품 기한 U30 · 라이선스 ADR-029. **문구가 이 사실과 어긋나면 문구를 고친다**(12 와 같은 원칙). 화면 위치는 [07](07-frontend.md), 노출 방식은 이 문서가 정하지 않는다.

## 0. 사용 방법과 용어

- 게시 위치 제안: ① 모의 고지(§1)는 금전 화면 배너·README 상단의 짧은 문구 + `/terms` 상단 ② 약관(§2)·환불(§3)은 `/terms` ③ 개인정보(§4)는 기존 `/privacy`(12 §4)의 해당 절에 병합 ④ 지갑(§5)은 지갑 연결 화면. MDX 파일 배치는 12 §1 을 따른다.
- 용어는 12 §6 용어집과 ADR-048 에 맞춘다: **POINT**(플랫폼 크레딧), **USDC**(원장의 모의 정산 통화), **tUSDC**(devnet 모의 토큰, 메타데이터 이름 'Test USDC (demo)').
- 밑줄 대괄호 `[사용자 제공 필요: …]` 는 값이 정해지지 않은 자리표시다. 숫자는 새로 만들지 않았고 기존 설계 값만 인용했다.

## 1. 모의 사이트 고지

**ko**

> 이 사이트는 포트폴리오용 **모의(시뮬레이션) 사이트**입니다.
> - 실제 결제, 실물 배송, 실제 자산은 **없습니다**. 금전으로 바꿀 수 있는 것도 없습니다.
> - POINT, USDC, tUSDC, 에스크로, 택배·배송 추적은 **모두 시뮬레이션**입니다. 화면의 금액에는 "모의" 표시가 붙습니다.
> - 상품 가격은 특정 시점의 **참고가**일 뿐 실제 거래 가격이 아닙니다.
> - 이 사이트는 외부 쇼핑몰, 결제사, 택배사와 **무관**하며 제휴·보증 관계가 없습니다. 상품 이미지는 자체 제작물이거나 이미지가 없습니다.

**en**

> This is a **simulated portfolio site**.
> - There are **no real payments, physical shipments, or real assets**, and nothing here can be exchanged for money.
> - POINT, USDC, tUSDC, escrow, and parcel/shipping tracking are **all simulations**. Amounts on screen carry a "mock" label.
> - Product prices are **reference prices at a point in time**, not actual trade prices.
> - This site is **not affiliated with** any external shopping mall, payment provider, or carrier, and implies no endorsement.

화면 한 줄 배너(D18): ko "모의 서비스 — 실제 결제·배송·자산이 없습니다" / en "Simulated service — no real payments, shipping, or assets".

## 2. 이용 약관 초안

**ko**

> 1. **성격**: 이 사이트는 개인 포트폴리오 데모이며 상업 서비스가 아닙니다. 아래는 이용 안내입니다.
> 2. **계정**: 계정은 GitHub 로그인으로 만듭니다. 사이트는 공개 프로필의 숫자 ID·로그인명·아바타 URL 만 사용하며 이메일은 받지 않습니다(§4). 로그인하지 않아도 일부 기능을 둘러볼 수 있고, 첫 지급 등 일부 기능은 로그인이 필요합니다.
> 3. **모의 데이터**: 주문, 잔액, 지급, 거래 내역은 모두 모의 데이터이며 가치가 없습니다. 운영자는 데이터를 사전 고지 없이 초기화하거나 조정할 수 있습니다.
> 4. **서비스 중단**: 이 사이트는 운영자의 집 PC 한 대에서 운영됩니다. 정전·네트워크·점검 등으로 **예고 없이 중단될 수 있고** 가용성을 보장하지 않습니다. 중단 시 별도 주소의 정적 대체 페이지가 안내 창구가 됩니다.
> 5. **부정 이용 금지**: 자동화된 대량 요청, 지급·교환 남용(복수 계정 등), 서비스 방해, 다른 사용자 또는 운영 시스템에 대한 침해 시도, 타인의 개인정보·불법 콘텐츠 게시를 금지합니다. 위반 시 글 숨김, 기능 제한, 계정 정지가 있을 수 있습니다.
> 6. **콘텐츠와 라이선스**: 사이트의 글·이미지 등 콘텐츠의 권리와 이용 조건은 저장소의 `CONTENT-LICENSE.md` 를 따릅니다. 코드의 라이선스는 `LICENSE` 를 따릅니다. 사용자가 작성한 글의 처리는 §4 를 참고하세요.
> 7. **책임의 범위**: 모의 서비스이므로 데이터 손실, 중단, 오류로 인한 손해에 대해 보증하지 않습니다. 이 항의 법적 효력 범위는 **[법무 검토 필요]**.
> 8. **변경**: 약관은 바뀔 수 있으며 변경 이력을 페이지 하단에 날짜와 함께 남깁니다.

**en**

> 1. **Nature**: This site is a personal portfolio demo, not a commercial service. The following is usage guidance.
> 2. **Account**: Accounts are created through GitHub login. The site uses only the public numeric ID, login name, and avatar URL, and does not collect email (§4). Some features can be browsed without login; others, such as the initial grant, require it.
> 3. **Mock data**: Orders, balances, grants, and transaction history are all mock data with no value. The operator may reset or adjust data without prior notice.
> 4. **Interruptions**: The site runs on a single home PC owned by the operator. It **may go down without notice** (power, network, maintenance) and availability is not guaranteed. During an outage, a static fallback page at a separate address is the information desk.
> 5. **Prohibited use**: automated bulk requests, abuse of grants or exchanges (e.g., multiple accounts), disrupting the service, attempts to attack other users or the operating systems, and posting others' personal data or unlawful content. Violations may lead to hidden posts, limited features, or suspended accounts.
> 6. **Content and licenses**: Rights to site content (text, images, etc.) and its terms of use follow `CONTENT-LICENSE.md` in the repository; code follows `LICENSE`. See §4 for how user-written posts are handled.
> 7. **Scope of responsibility**: As a simulated service, no warranty is given for data loss, downtime, or errors. The legal effect of this clause is **[legal review needed]**.
> 8. **Changes**: These terms may change; a dated change history is kept at the bottom of the page.

## 3. 환불·반품 정책 (모의)

사실: 반품 가능 기한 5일(`RETURN_WINDOW_DAYS`, U30 제안값), 에스크로 자동 해제 7일(`ESCROW_AUTO_RELEASE_DAYS_AFTER_DELIVERY`), 시연 시간은 `ESCROW_TIME_SCALE` 로 압축([phases/02](phases/02-commerce.md)). 환불은 원래 자산으로 되돌린다(ADR-048 E4).

**ko**

> - **모의 정책입니다. 실제 환불은 없습니다.** 환불은 사이트 안의 모의 잔액(POINT·USDC)이 되돌아오는 것을 뜻하며 현금·카드·실제 암호자산으로 지급되지 않습니다.
> - **반품**: 배송 완료(데모 주문은 종결) 후 **5일** 안에 요청할 수 있습니다. 기한이 지나면 요청이 거절됩니다.
> - **에스크로 자동 해제**: 배송 완료 후 **7일**이 지나면 에스크로가 판매자 정산으로 자동 해제됩니다. 반품 기한(5일)이 해제(7일)보다 짧으므로 반품 요청은 해제 전에 도달합니다. 반품 요청이 있으면 해제 타이머가 멈춥니다.
> - **환불 방식**: 결제에 쓴 자산별로 돌려드립니다. POINT 는 POINT 로, USDC 는 낸 수량 그대로 되돌립니다(환율을 다시 계산하지 않습니다). 부분 환불도 같은 규칙입니다.
> - **시연 시간 압축**: 며칠을 기다릴 수 없으므로 시연에서는 위 기간을 **압축된 시계**로 재현합니다. 화면의 "5일·7일"은 설계상 기한이고, 시연 중 실제 경과 시간은 이보다 훨씬 짧을 수 있습니다.

**en**

> - **This is a mock policy. No real refunds are made.** A refund means mock balances (POINT, USDC) are returned inside the site; nothing is paid out as cash, card, or real crypto assets.
> - **Returns**: You may request a return within **5 days** after delivery is complete (for demo orders, after the order is closed). Requests after that are rejected.
> - **Automatic escrow release**: **7 days** after delivery, escrow is automatically released to the seller settlement. Because the return window (5 days) is shorter than the release (7 days), return requests arrive before release. A return request pauses the release timer.
> - **Refund method**: Returned per asset used. POINT comes back as POINT; USDC comes back as the exact amount paid (the rate is not recomputed). Partial refunds follow the same rule.
> - **Compressed demo time**: Since nobody can wait days, the demo replays these periods on a **compressed clock**. "5 days / 7 days" are the designed deadlines; actual elapsed time during a demo can be much shorter.

## 4. 개인정보 처리 안내 요점

수집 항목·수집하지 않는 항목·제3자는 **[12 §4](12-content.md) 와 FR-121 이 정본**이다. 이 절은 인용만 하고 새로 만들지 않는다. 최종 `/privacy` 는 그 구조(절 1~9)를 따른다.

**ko**

> - **수집·미수집·제3자**: `/privacy` 의 "수집하는 것 / 수집하지 않는 것 / 제3자" 절을 따릅니다(세션 쿠키, GitHub 공개 프로필 정보, 작성 글; IP·이메일 미수집 — 12 §4 정본).
> - **쇼핑·배송·채팅 기능을 켠 경우**의 추가 항목(배송지·수령인 정보, 대국 채팅, 고객 문의)은 해당 기능 설계의 정본(phases/00 암호화 표 ENC)을 따르며, 기능이 공개될 때 `/privacy` 에 함께 반영합니다.
> - **보관 기간(U7 확정값)**: 대국 채팅 **30일** · 고객 문의(CS) 본문 **1년** · 신고 스냅샷 **90일** · 결제 이벤트 **90일** · 택배 이벤트 **90일**. 배송지·수령인 정보는 종료 후 **30일**에 익명화합니다. 세션·로그 등 기본 항목의 기간은 `/privacy` 를 따릅니다.
> - **삭제·정정 요청**: 문의처는 **[사용자 제공 필요: 연락 수단]**, 처리 목표 기간은 **[사용자 결정 필요]**. 처리 기한을 지킬 수 없는 약속은 적지 않습니다.
> - 이 안내는 포트폴리오 데모의 안내문이며 법무 검토를 받지 않았습니다. 처리방침의 법정 필수 기재 사항 충족 여부와 유출 시 통지 의무(A-027)는 **[법무 검토 필요]**.

**en**

> - **Collected / not collected / third parties**: see the corresponding sections of `/privacy` (session cookie, public GitHub profile data, user-written posts; no IP or email collected — canonical in 12 §4).
> - **When shopping, shipping, or chat features are enabled**, additional items (shipping address and recipient, game chat, support inquiries) follow the canonical design of each feature (the ENC table in phases/00) and will be added to `/privacy` when those features go public.
> - **Retention (U7 confirmed)**: in-game chat **30 days** · support (CS) message bodies **1 year** · report snapshots **90 days** · payment events **90 days** · parcel events **90 days**. Shipping address and recipient data are anonymized **30 days** after completion. Basic items such as sessions and logs follow `/privacy`.
> - **Deletion/correction requests**: contact **[owner to provide: contact method]**, target response time **[owner to decide]**. No promises that cannot be kept.
> - This is a notice for a portfolio demo and has not had legal review. Whether it meets the statutory mandatory contents of a privacy policy, and breach-notification duties (A-027), **need legal review**.

## 5. 지갑 연결·devnet 안내

**ko**

> - 지갑 연결은 **선택**입니다. 연결하지 않아도 POINT 로 모든 구매·교환을 체험할 수 있습니다.
> - 연결하면 Solana **devnet(시험 네트워크)** 에서 소액 에스크로 시연을 체험할 수 있습니다. **실제 자산이 아니며** 메인넷에는 연결되지 않습니다. 메인넷 지갑·실제 자산을 사용하지 마세요.
> - 시연에 쓰는 **tUSDC** 는 사이트가 발행하는 모의 토큰(이름 'Test USDC (demo)')으로 **실제 USDC 가 아닙니다.** 운영자가 설정을 바꾸면 Circle devnet USDC 를 쓸 수도 있으며 이것도 시험용 토큰입니다.
> - 연결 시 사이트는 **공개키**만 저장하고 서명 요청은 메시지 서명뿐입니다. 개인키·시드 문구를 요구하지 않습니다. 언제든 연결을 해제할 수 있습니다.
> - 시험 네트워크의 수수료는 사이트가 대신 내며, 대납에는 상한이 있어 소진되면 안내 화면으로 바뀔 수 있습니다.
> - 원장(사이트 내부)의 모의 USDC 잔액은 온체인 자산이 아닙니다.

**en**

> - Connecting a wallet is **optional**. Without one, you can experience every purchase and exchange with POINT.
> - If you connect, you can try a small escrow demo on Solana **devnet (a test network)**. These are **not real assets**, and the site does not connect to mainnet. Do not use a mainnet wallet or real assets.
> - **tUSDC** used in the demo is a mock token issued by the site (named 'Test USDC (demo)') and is **not real USDC**. If the operator changes the setting, Circle's devnet USDC may be used instead; that too is a test token.
> - On connecting, the site stores only your **public key**, and the only request is a message signature. It never asks for private keys or seed phrases. You can disconnect at any time.
> - The site pays test-network fees on your behalf, with limits; when exhausted, the screen may switch to a guidance page.
> - Mock USDC balances in the site ledger are not on-chain assets.

## 6. 사용자가 검토할 판단 지점

| # | 판단 | 비고 |
|---|---|---|
| 1 | 약관 7항(책임의 범위) 유지 여부 | 법적 효력은 단정하지 않음 → 법무 검토 |
| 2 | 부정 이용 조치 범위(숨김·제한·정지) | 운영 정책과 일치해야 함 |
| 3 | 반품 5일·자동 해제 7일 표기 | U30 은 제안값, 확정 시 문구 갱신 |
| 4 | 시연 시간 압축을 사용자에게 어디까지 노출할지 | 현재는 설명만 |
| 5 | 연락 수단·처리 목표 기간 | 12 체크리스트 값과 공유 |
| 6 | §4 의 법정 필수 기재 사항·통지 의무(A-027) | 법무 검토 필요 |
| 7 | 보관 기간 숫자 | U7 확정값 인용, 법적 의무는 미확인 |
| 8 | 영문 번역의 톤(12 §5 번역 규칙) | 사용자 검토 |

변경 이력: 2026-11-05 초안 작성.
