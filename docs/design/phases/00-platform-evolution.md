# P0. 플랫폼 진화 설계 (Phase 0~6)

M1 설계(00~15, features/)는 사이트 셸과 방명록 데모를 닫았다. 이 문서는 그 위에 **바둑(Phase 1~2) · 상거래(Phase 3·5) · 풀필먼트(Phase 6) · 채팅(Phase 1·6)** 을 올릴 때 **영역마다 따로 정하면 어긋나는 것**을 한 곳에서 정한다.
네 영역 설계(`01-baduk`, `02-commerce`, `03-fulfillment`, `04-chat`)는 이 문서의 결정 번호(**D1…D26**)를 인용한다.

> **구현 순서 ≠ Phase 번호 (D24).** Phase 번호는 로드맵 식별자로 유지하고, 구현 순서는 **M1 → 3 → 4 → 5 → 6a → 6b → 6c → 6d → 1 → 2 → 6e** 이다(바둑 계열(Phase 1·2)이 마지막이고, 마작은 그 뒤 6e). 모든 영역 설계는 동결하지 않고 끝까지 완성하며, 각 Phase 착수 전에 설계 재검토 단계(§12.5)를 거친다. 아래 표·절은 Phase 번호로 쓰되 '순서' 열이나 §1.4 로 구현 순서를 읽는다.

- 상태: 이 문서와 ADR-030~048(이 문서는 030~033, 영역 설계는 034~048) 은 **Accepted(2026-11-05, 사용자 일괄 확정, U1)** 이다. 이후 변경은 개정 ADR 로 한다. 단 U11·U17·U21·U23(사용자 변경)에 따른 본문 반영은 별도 작업 중이다.
- 근거: README 로드맵, ADR-001·002·005·006·009~016·017~028, [architecture.md §12](../../domains/architecture.md), [database-schema.md §11](../../domains/database-schema.md).
- 모든 금전 요소는 **모의·테스트 환경**이다(ADR-015). 이 저장소 밖 다른 프로젝트의 코드는 참고하지 않았다.
- 값은 **측정(M1 실측·이번 유휴 측정)**, **추정**, **미확인**을 구분해 적었다.

## 0. 결정 요약

| D | 결정 | ADR | 영향 영역 |
|---|---|---|---|
| **D1** | **모듈러 모놀리스를 유지**한다. 분리는 5축 기준(독립 확장·언어/런타임·자원 프로파일·장애 격리·배포 주기) 중 **둘 이상이 강하게 해당할 때만** 한다. 기본값은 "분리 안 함" | 030 | 전부 |
| **D2** | 분리 판정 결과: **KataGo 분석 워커만 별도 프로세스·이미지**(Phase 2). 나머지(game·chat·deal·order·payment·settlement·fulfillment·support)는 모놀리스 모듈이다. 엔트리포인트 분화는 허용(같은 이미지). 분석 워커는 **별도 이미지 `pf-analysis`**(KataGo 바이너리 포함)이며 DB 쓰기는 `analysis` 스키마, ledger 전이(쌍 #6: `ConfirmRewardInTx`/`FlagRewardInTx`), `events.outbox_event`(+inbox), 감사(audit)뿐이다 | 030 | P1·P2·P3·P4 |
| **D3** | 룸 실시간(대국·채팅·CS)은 **`ws-gateway` 에 핸들러를 추가**한다. **`/ws/room` 의 첫 사용처는 6a(CS 채팅)** 이고 대국 룸(`game:*`)은 Phase 1 에서 같은 연결에 추가된다. 부하·재시작 격리가 필요하면 룸 연결이 존재하는 시점 이후(6a 이후 재평가)에 `ws-gateway` 를 사이트용/룸용 두 배포 단위로 나눈다(같은 이미지, 인자 `--surface=site|room`) | 032·033 | P1·P4 |
| **D4** | 이벤트 전달 정본은 **Postgres outbox + inbox**(ADR-005·020)를 유지한다. Redis Streams 는 `EventTransport` 포트(ADR-024)의 **소비자 단위 선택 어댑터**로 두고, **Phase 3 의 타임딜 버스트 측정**으로 채택을 판정한다(ADR-006 의 "Phase 2 착수 전" 시점을 바꾼다) | 031 | P2 |
| **D5** | Streams 를 쓰는 소비자의 설계: 모듈당 스트림 1개(`pf:evt:<module>`), 소비자 그룹 = inbox 소비자 이름, 전달→inbox 저장→`XACK`, 회수는 `XAUTOCLAIM`, 유실 방어는 `TransportReconciler` | 031 | P2 |
| **D6** | Redis 는 **Phase 3 에 도입**한다(재고 Lua). **단일 인스턴스 1개**(컨테이너 1개)로 시작하고(`noeviction`, 비스트림 키는 전부 TTL, 키 접두사 규약 `pf:stock:*`·`pf:evt:*`·`pf:rl:*`로 논리 분리), `redis-stock`/`redis-stream` 컨테이너·접속 분리는 Phase 4 에서 장애 영역 분리와 함께 재평가한다 | 031·033 | P2 |
| **D7** | Redis 에 있는 모든 것은 **Postgres 에서 재구성 가능**해야 한다(정본은 항상 Postgres, ADR-010·021). 재구성 절차가 없는 용도에는 Redis 를 쓰지 않는다 | 031 | P2·P4 |
| **D8** | WebSocket 은 **서버→클라이언트 push 전용**을 유지한다(쓰기는 REST, ADR-018). 룸 범위 채널은 **세 번째 연결 `/ws/room`** 으로 추가한다(인증 필수, 한 연결에 여러 룸 구독). 인바운드 허용은 `hello`·`room.join`·`room.leave`·`ping`·휘발성 `typing` 뿐이며 대국·채팅 명령은 받지 않는다 | 032 | P1·P4 |
| **D9** | `realtime` 모듈은 **포트를 소유**하고(`RoomAccessPolicy`, `RoomSnapshotProvider`, `RoomMessageMapper`, `RoomEventSource`) 도메인 모듈이 조립부에서 구현을 등록한다 → `realtime` 은 도메인 모듈에 의존하지 않는다 | 032 | P1·P4 |
| **D10** | 룸 이벤트 지연 예산 **p95 ≤ 250ms**(제안, 미측정). **자체 순번 로그를 가진 룸(대국 `game_event`)은 명령 tx 의 `NOTIFY room_changed` + `RoomEventSource` 로 즉시 push 하는 fast lane 을 기본**으로 하고, 로그 없는 룸이 예산을 넘길 때의 2차 대응 `AppendRoomLogInTx` 는 **미사용 예약**이다(쓰려면 ADR-030 개정으로 허용 쌍 #11 을 먼저 추가, §6.7) | 032 | P1·P4 |
| **D11** | 역할은 `visitor / user / agent / operator / admin`. **seller 는 두지 않는다**(단일 판매자 = 운영자). `agent`(CS 상담원)·`operator`(창고 작업자)·`admin` 은 모두 **설정 허용목록**(`AGENT_GITHUB_IDS` / `OPERATOR_GITHUB_IDS` / `ADMIN_GITHUB_IDS`, 숫자 GitHub ID, M1 ID-09 방식)으로 판정한다 — DB 에 권한 플래그를 두지 않아 DB 조작으로 권한 상승을 만들 수 없다(`role_grant` 표는 두지 않는다). 데모 모드의 샌드박스 작업자 체험은 사용자 결정(§16) | — | P3·P4 |
| **D12** | Passkey(Phase 6)는 `credential` 표를 추가할 뿐 **세션·행위자 키 모델은 바뀌지 않는다** | — | 전부 |
| **D13** | **Phase 5 착수 직전 필드 암호화를 KEK/DEK 봉투 방식으로 상향**한다(ENC 필드가 3개 이상이 될 예정이므로 ADR-026 재검토 조건에 따라 선제 상향). 카드 데이터는 저장하지 않는다 | — | P2·P3·P4 |
| **D14** | 자원 예산 규칙: 라이브 호스트 RAM 의 **60% 이하**(상시), KataGo 는 **CPU 시간 예산을 따로** 둔다(12GB·2 OCPU 호스트에서는 메모리보다 CPU 예산이 먼저 걸린다, §11.2) | 033 | P1·P2 |
| **D15** | 지표 이름은 `pf_<도메인>_…`, 오류 wire code 는 모듈 접두사 없음, 이벤트 이름은 `<aggregate>.<verb-past>`, 스키마는 `<module>` / `<module>_read` | — | 전부 |
| **D16** | 모듈 간 동기 의존은 **피호출 층 ≤ 호출자 층**일 때만 허용한다(같은 층 허용, 위 방향은 이벤트·포트 역전; 경계 규칙 B12 제안). **같은 층 호출이 허용되므로 순환은 B5 가 막는다** | 030 | 전부 |
| **D17** | Phase 4 워크로드 분리 단위: `api`, `ws-gateway`, `worker`, `web`(+ 레플리카·HPA). **`ws-gateway(site)`/`ws-gateway(room)` 분화와 `analysis-worker` 는 `/ws/room`(6a)·KataGo(Phase 2)가 생긴 뒤 해당 시점에 적용**한다(D24). 롤링은 M1 G8 실측 패턴(readyz 503 → bye/1001 → preStop 5초)을 재사용 | 033 | P1·P4 |
| **D18** | 금전 화면·응답에는 **"모의" 표시**를 항상 둔다(배너 + `X-PF-Mock: 1` 응답 헤더, ADR-015) | — | P2·P3 |
| **D19** | **presence 는 `realtime` 모듈이 소유**한다(`PresenceCounter` 포트, ADR-024). 도메인(game, chat)은 읽기 포트 `PresenceReader` 로 조회만 하며 **규칙 판정(이탈·`abandoned`)에는 쓰지 않는다**(판정은 game 소유 heartbeat 신호, §6.9) | 032 | P1·P4 |
| **D20** | **`ledger` 모듈 하나**가 다중 자산(POINT/KRW/USDC) 복식 원장을 소유한다. 스키마 정본은 ADR-040, POINT 자산 규칙과 보상 상태 머신은 ADR-037 (§2.5) | 037·040 | P1·P2 |
| **D21** | **모듈 간 한 트랜잭션은 `*InTx` 공개 usecase 의 허용 쌍으로만** 한다(경계 규칙 B12, §2.4). 중첩 `uow.run` 금지는 유지한다 | 030 | P1·P2·P4 |
| **D22** | **이벤트 계약 정본 표는 §8.3 하나**다. 영역 문서의 이벤트 이름·페이로드가 다르면 §8.3 이 이긴다 | — | 전부 |
| **D23** | **Phase 2 분석 큐는 Postgres inbox 선점**(DB 큐)이다. Redis Streams 판정은 Phase 3(D4) | 031·036 | P1 |
| **D24** | **구현 순서는 Phase 번호와 분리한다**: M1 → **Phase 3**(타임딜·Redis·`ledger`(POINT·모의 USDC 지급·교환·혼합 결제)·최소 `pricefeed`·`payment`·`escrow`·환불) → **4** → **5** → **6a**(CS 채팅, 범용 `chat` 코어·`/ws/room` 도입) → **6b**(Passkey) → **6c**(WMS) → **6d**(Solana devnet) → **Phase 1**(바둑 + 대국 채팅 룸) → **Phase 2**(KataGo + 바둑 보상) → **6e**(마작). 근거: 타임딜이 신호 대비 비용이 가장 좋고(초과 판매 0·k6 결과표), 3D 클라이언트·룰 엔진·KataGo 실행 가능성의 위험이 큰 바둑을 뒤로 미룬다. 이력서 제출 가능 시점은 **M1 + Phase 3 + Phase 4 완료**. 선행 공백과 해법은 §1.4 | 048 | 전부 |
| **D25** | **모의 통화 경제 (ADR-048)**: 구매자 자산은 **모의 USDC**, 플랫폼 크레딧은 **POINT**. 첫 로그인 지급 = **POINT 100,000 만**(사용자당 1회; 당초 안 USDC 10,000 + POINT 1,000 은 2026-11-05 개정 1 에서 POINT 1,000 만으로, 같은 날 개정 2 에서 100,000 으로 상향 — U27). USDC 는 원장 고정액으로 자동 지급하지 않고 `WELCOME_GRANT_USDC_MICRO`(환경별, 라이브 기본 0)·지갑 연결 사용자의 devnet USDC 로 공급(U24). POINT 출처는 지급·**USDC→POINT 단방향 교환**·바둑 보상(마지막). 결제는 **혼합(포인트 우선 차감 후 USDC)**, 환불은 다리별 원래 자산, 정산은 USDC(POINT 몫은 플랫폼 부담 `exp:point_redemption:USDC`, 정산 환율은 총액 차이 방식 P2 §8.5.1). `POINT_KRW_RATE` 는 1:1 고정(U18) | — | P2 §6.1.1·§8.2.1·§8.5.1, ADR-048 |
| **D26** | **Solana 지갑은 선택 사항**: 서명 챌린지로 공개키를 연결(`identity.wallet_link`, §7.3)하면 Phase 6d 의 devnet 에스크로 시연을 체험한다. 원장의 모의 USDC 잔액은 온체인이 아니다. 시연 토큰은 자체 발행 `tUSDC`(devnet 모의 토큰) 기본 + 설정 `SETTLEMENT_MINT` 로 Circle devnet USDC 연결(U28, 확정 2026-11-05) | — | ADR-048, P2 §8.7 |

## 1. 로드맵별 목표 아키텍처 진화

### 1.1 Phase 별 추가분 (구현 순서대로)

| 순서 | Phase | 추가되는 것 | 컨테이너 | 모듈 | 스키마 | 채널 | 인프라·관문 |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 모노레포, CI, k3d 최소 배포 | (M1 컨테이너 세트) | — | — | — | G8(통과), Gateway API |
| 1 | **M1** | 사이트 셸·방명록·시각화 | proxy, web, api, ws-gateway, worker, postgres, prometheus, grafana (+호스트의 tailscaled/Funnel) | identity, guestbook, events, realtime, observability | 위 모듈 + `*_read` | `/ws/public`, `/ws/private` | tech-stack 관문 G2~G10 + Funnel 관문 G14 (G1 은 Funnel 교체로 폐기; §1.4 의 G14 와 다른 번호계) |
| 2 | **3** | 타임딜 + **`ledger`(POINT·모의 USDC) 도입**과 첫 로그인 지급(POINT 100,000; USDC 는 환경별 공급)·USDC→POINT 교환, **혼합 결제**(포인트 우선 + USDC)와 환불, 최소 `pricefeed`·`escrow` | **redis** | catalog, deal, order(구매 접수), **ledger**, payment(원장 결제·환불), **pricefeed(최소)**, **escrow(최소: hold·release·refund)** | `catalog`, `deal`, `order`, `ledger`, `payment`(최소), `pricefeed`(최소), `escrow`(최소), 각 `_read` | `/ws/public`(재고 카운트 푸시), `/ws/private`(구매 결과) | Redis 도입, Streams 판정(D4), k6, B12 쌍 #2·#3·#4·#5·#7·#8 |
| 3 | **4** 🎯 | 프로덕션화 | api·ws-gateway(site) 레플리카, HPA 대상 | — | — | — | 워크로드 분리, PDB·probe, CD, 에셋 캐시, **Redis 공유 속도 제한·presence·세션 캐시 무효화(§5.1, 레플리카 ≥2 가 되므로)** (Phase 4 에는 룸 연결이 없으므로 룸 분화는 6a 이후 재평가, D17) |
| 4 | **5** | 모의 카드 결제·분쟁·반품 동결·정산·실제 시세 | (추가 없음 — 웹훅은 api 경로) | payment(카드·웹훅·환불 확장), escrow(분쟁·동결·자동 확정 타이머 확장), settlement, pricefeed(실제 소스·교차 검증 추가) | `payment` 확장, `escrow` 확장, `settlement`, `pricefeed` 확장 (+`_read`) | `/ws/private`(결제 상태) | KEK/DEK 상향(D13), PG 테스트 모드, B12 쌍 #4(확장)·#5/#7/#8(확장)·#9 |
| 5-a | **6a** | CS 채팅 | (추가 없음) | **chat(코어 첫 도입)**, support | `chat`, `chat_read`, `support`, `support_read` | **`/ws/room` 도입**(`chat:*`, `cs:*`) | `RoomAccessPolicy` 포트(ChatRoomPolicy·CsRoomPolicy), `agent` 역할, B12 쌍 #1 |
| 5-b | 6b | Passkey | — | identity 확장 | `identity.credential` | — | — |
| 5-c | 6c | WMS | — | inventory, fulfillment | `inventory`, `fulfillment` (+`_read`) | `/ws/private`(작업자 알림) | `operator` 역할, B12 쌍 #10, **약정(earmark) 활성화**(§1.4) |
| 5-d | 6d | Solana USDC 에스크로(devnet) | — | escrow 의 체인 어댑터 | — | — | 체인 어댑터 경계(ADR-016) |
| 6 | **1** | 바둑 코어 + **대국 채팅 룸 종류 추가** | (추가 없음 — ws-gateway·api 에 핸들러) | game, chat(대국 룸 종류) | `game`, `game_read` | `/ws/room`(`game:*`, 대국 채팅 룸) | 룰 엔진 선정(ADR-012), 3D 에셋 서빙, fast lane 측정 |
| 7 | **2** | KataGo 분석 + **바둑 보상**(포인트 마지막 출처) | **`analysis-worker`**(+ KataGo 바이너리 이미지) | analysis, ledger 확장(`EligibilityPolicy`·reward) | `analysis`, `ledger` 확장 | `/ws/private`(보상 상태 푸시) | CPU 예산(D14), 선점→트랜잭션 밖 분석, B12 쌍 #6 |
| 8 | 6e | 마작(`GameRules` 플러그인) | — | game 규칙 플러그인 | — | — | Phase 1 의 게임 프레임 재사용 |

### 1.2 진화 타임라인 (구현 순서)

```mermaid
flowchart LR
    M1["M1<br/>사이트 셸 · 방명록<br/>이벤트 시각화"] --> P3["Phase 3<br/>타임딜 · Redis 도입<br/>ledger(POINT·USDC) · 혼합 결제<br/>최소 escrow · 환불"]
    P3 --> P4["Phase 4 🎯<br/>프로덕션화<br/>워크로드 분리 · HPA"]
    P4 --> P5["Phase 5<br/>카드 결제 · 에스크로 확장<br/>정산 · 시세 · KEK/DEK"]
    P5 --> P6a["Phase 6a<br/>CS 채팅<br/>chat 코어 · /ws/room"]
    P6a --> P6b["6b Passkey"]
    P6b --> P6c["6c WMS<br/>풀필먼트"]
    P6c --> P6d["6d Solana devnet<br/>에스크로"]
    P6d --> P1["Phase 1<br/>바둑 코어 + 대국 채팅 룸<br/>game"]
    P1 --> P2["Phase 2<br/>KataGo 분석 워커<br/>바둑 보상"]
    P2 --> P6e["6e 마작<br/>규칙 플러그인"]
```

순서 재검토는 §12, 선행 공백과 해법은 §1.4 에 있다(WMS 는 주문·재고·결제가 선행, 마작은 Phase 1 의 게임 프레임 재사용이 선행, 바둑은 `chat` 코어·`/ws/room`·`ledger`·B12 가 이미 있다는 전제).

### 1.3 목표 컨테이너 구성 (Phase 6e 까지 끝난 최종 상태 — 구현 순서와 무관한 도착점)

```mermaid
flowchart TB
    V["방문자 · 사용자 · 상담원 · 관리자"] --> CF["Tailscale Funnel<br>*.ts.net · TLS 는 PC 에서 종료"]
    CF --> CFD["tailscaled (호스트)"]
    CFD --> PX["proxy nginx"]
    PX --> WEB["web Next.js"]
    PX --> API["api<br/>REST · 웹훅 수신"]
    PX --> WSS["ws-gateway site<br/>/ws/public · /ws/private"]
    PX --> WSR["ws-gateway room<br/>/ws/room"]
    subgraph core["모놀리스 코드베이스 · 같은 이미지"]
        API
        WSS
        WSR
        WRK["worker<br/>디스패처 · 러너 · 잡"]
    end
    ANA["analysis-worker<br/>KataGo 분석"]
    PG[("postgres<br/>쓰기 · 읽기 스키마")]
    RD[("redis<br/>재고 · 속도 제한 · presence · streams")]
    API --> PG
    WRK --> PG
    WSS --> PG
    WSR --> PG
    ANA --> PG
    API --> RD
    WRK --> RD
    PRM["prometheus"] -.-> API
    PRM -.-> WSS
    PRM -.-> WSR
    PRM -.-> WRK
    PRM -.-> ANA
    GRF["grafana 공개 대시보드"] --> PRM
    API -.->|"모의 PG 테스트 모드"| PGX["PG 테스트 API"]
    WRK -.->|"시세 수집"| FEED["시세 소스"]
    WRK -.->|"모의 택배 어댑터"| COU["택배 모의 API"]
```

### 1.4 구현 순서 변경(D24)의 선행 의존과 공백

바둑 계열(Phase 1~2)을 마지막에 두면 **앞 Phase 가 바둑이 만들어 주던 것을 스스로 마련**해야 하고, 바둑은 **앞 Phase 가 만든 기반 위에서** 시작한다. 공백과 해법을 모았다.

**(1) 단계별 선행 요구**

| 구현 순서 | 선행 구현에 요구하는 것 | 이 단계가 새로 도입하는 기반 |
|---|---|---|
| Phase 3 | M1(events·realtime·audit·identity) | Redis, `ledger`(POINT·USDC), `catalog`·`deal`·`order`, 최소 `payment`(원장 결제·환불), 최소 `pricefeed`(고정 환율), 최소 `escrow`(hold·release·refund), B12 의 틀과 쌍 #2·#3·#4·#5·#7·#8 |
| Phase 4 | Phase 3(서비스가 있어야 분리·HPA 의미) | 워크로드 분리, HPA·PDB·probe, CD |
| Phase 5 | Phase 3(order·ledger·payment·escrow 최소형), Phase 4 권장(운영 기반) | `escrow` 확장(분쟁·반품 동결·정산 입력·자동 확정 타이머), `settlement`, 카드 어댑터·웹훅, 실제 시세 소스·교차 검증기, KEK/DEK 상향 |
| 6a | M1(realtime·identity), Phase 3(주문 연동 context), Phase 5(KEK/DEK v2 — CS 본문 ENC) | **`chat` 코어(방·참가자·메시지·방 카운터)**, **`/ws/room`**, `RoomAccessPolicy` 포트, `support`, `agent` 역할, B12 쌍 #1 |
| 6b | M1(identity) | `identity.credential` |
| 6c | Phase 3(deal·order), Phase 5(결제·에스크로 완료 이벤트), 6a(`RolePolicy`·`ActorContext.roles` 일반화, G12; CS 에서 배송 정보 노출은 선택) | `inventory`·`fulfillment`, `operator` 역할, 쌍 #10, 약정 활성화, **착수 점검: 물리 재고 시드·초기 약정 동기화·`fulfillment_mode=physical` 전환(G6)** |
| 6d | Phase 5(escrow·settlement) | 체인 어댑터 |
| **Phase 1** | **6a(`chat` 코어·`/ws/room`·룸 포트), Phase 3(B12 틀·`ledger` 는 Phase 2 보상에서 필요)** | `game`, 대국 룸·대국 채팅 룸 종류, `GameRoomPolicy`, fast lane |
| **Phase 2** | **Phase 1(`game.finished`), Phase 3(`ledger`·POINT 계정)** | `analysis`·`analysis-worker`, `EligibilityPolicy`·reward |
| 6e | Phase 1(게임 프레임) | 규칙 플러그인 |

**(2) 공백과 해법**

| # | 공백 | 발생 지점 | 해법 | 반영 문서 |
|---|---|---|---|---|
| G1 | **포인트·USDC 출처 없음** — 타임딜이 쓸 자산은 원래 바둑 보상이 만든다 | Phase 3 | `ledger` 에 **지급·교환 경로**를 둔다: ① `ClaimWelcomeGrant`(로그인 사용자 **1회**, **POINT 100,000 만** — USDC 는 `WELCOME_GRANT_USDC_MICRO` > 0 인 환경(로컬·시험)에서만 원장 지급, 저널 멱등 키 `grant:welcome:{uid}:{asset}`(자산별 1건), 유일성은 `ledger.grant` 의 `UNIQUE (github_id, kind)`(불변 subject 사본, 사용자 삭제는 소프트 삭제 톰스톤)) ② `AdminGrant`(관리자, 건당 상한, `grant:admin:{uid}:{requestId}:{asset}`) ③ `ExchangeUsdcToPoint`(단방향, §8.2.1; `Idempotency-Key` 필수·`maxUsdcMicro` 상한·`exchange_quote` 만료, 저널 키 `exchange:{userId}:{key}:{asset}`, `write.exchange` 속도 제한). 분개는 `exp:demo_grant:{POINT\|USDC}` / `liab:user_{points\|usdc}:{uid}`, 감사 `system.welcome_grant_claimed`·`admin.grant`·`system.points_exchanged`(제안), 지표 `pf_ledger_demo_grant_total{kind,asset}`·`pf_ledger_demo_supply{asset}`, 모든 화면 "모의" 표시. 같은 모듈 안 usecase 라 새 B12 쌍은 없다. **Phase 2 의 바둑 보상은 마지막 출처**(`exp:points_issued`)이며 계정으로 구분해 대사한다 | P2 §9, ADR-037·040·048, P1 §10 |
| G2 | **`payment` 모듈이 Phase 5 인데 Phase 3 이 원장 결제를 한다** | Phase 3 | Phase 3 에는 **`payment` 최소형**(`LedgerGateway`(포인트 우선 + USDC 혼합) + `payment.payment`·`payment_leg` 표, method=`ledger`, 환불 = 다리별 원장 역분개 + 최소 escrow `RefundInTx`)만 둔다. 카드 어댑터·웹훅 inbox·`payment_refund`·견적은 Phase 5 의 **추가 마이그레이션**으로 얹는다(표 변경은 컬럼 추가 중심) | P2 §6·§20 |
| G3 | **`pricefeed` 스냅샷이 필요하다** — USDC 다리는 환율이 있어야 한다(S16 j: 결제 시작 시 FX 스냅샷 고정) | Phase 3 | Phase 3 에 **최소 `pricefeed`**(고정 환율 소스 `FixedRateSource`, 설정 `DEMO_USDC_KRW_RATE_E8`, 스냅샷 행·견적 API)를 둔다. 따라서 **모든 결제가 처음부터 스냅샷을 갖고 `legacy_demo` 는 폐기**한다(AC-C27 이 Phase 3 부터). Phase 5 는 실제 시세 소스·교차 검증기를 같은 수집기에 **추가**한다 | P2 §8·§20, ADR-041·048 |
| G4 | **`escrow` 가 없다** | Phase 3 | **Phase 3 에 최소 `escrow`(hold / release / refund)를 둔다.** `ConfirmPurchase` 가 `escrow` 행·`escrow_leg` 를 만들고(`HoldInTx`, 쌍 #5), 결제 분개는 `liab:user_points`·`liab:user_usdc` → `liab:escrow:POINT`·`liab:escrow:USDC` 로 보류하며, 해제(쌍 #8)와 환불(쌍 #7)도 Phase 3 부터 활성이다. 분쟁(`disputed`)·반품 동결(`frozen`)·정산(`settlement`)·자동 확정 타이머는 Phase 5 가 **확장**한다(같은 표·같은 경로라 소급 이관 절차는 불필요) | P2 §7·§9 |
| G5 | **`inventory`(약정)가 없다** — 딜 게시가 약정 승인을 기다린다 | Phase 3 | 6c 전까지 `PublishDeal` 은 **약정 없이** `draft → scheduled` 로 간다(설정 `INVENTORY_EARMARK=off`, 상태 `publishing` 은 off 일 때 즉시 통과). 6c 에서 `INVENTORY_EARMARK=on` 으로 바꾸고 `deal-earmark-reactor` 를 활성화하며, **진행 중(open/scheduled) 딜은 초기 약정 동기화 잡**으로 맞춘다(닫힌·정산된 딜 제외) | P2 §4·§20, P3 §4.6·§18 |
| G6 | **주문이 `paid` 에서 멈춘다** — `fulfillment` 가 없다 | Phase 3~5 | 주문에 `fulfillment_mode ∈ {demo, physical}` 을 둔다. `ConfirmPurchase` 시점에 풀필먼트(6c)가 켜져 있지 않으면 `demo`, 켜져 있으면 `physical`. **`demo` 주문은 풀필먼트가 소비하지 않으며** 관리자 `MarkDelivered` 또는 구매자 `confirm-receipt`(`paid` 에서 허용)로 종결하고, 에스크로 자동 해제는 `ESCROW_TIME_SCALE` 시간 압축으로 재현한다(Phase 5 DoD 의 재현 경로). `physical` 주문만 `order.paid` 를 풀필먼트가 소비한다. 6c 착수 점검에 물리 재고 시드·초기 약정 동기화를 포함한다 | P2 §7·§20, P3 §2·§18 |
| G7 | **`/ws/room` 이 Phase 3~5 에 없다** | Phase 3~5 | 구매 결과·재고 카운트는 기존 `/ws/private`·`/ws/public` 으로 충분하다(M1 채널 불변). `/ws/room` 은 **6a 에서 처음 도입**되고 대국 룸은 Phase 1 에서 같은 연결에 추가된다(D3·D8) | §6, ADR-032 |
| G8 | **Phase 4 에 `/ws/room`·KataGo 가 없다** | Phase 4 | 분화 대상에서 제외한다. `ws-gateway` 분화는 6a 이후 재평가(D3·D17), `analysis-worker` 는 Phase 2 에 합류한다 | §10.1 |
| G9 | **`chat` 코어의 첫 사용처가 CS 채팅**이다 | 6a | 방 종류를 `support_ticket` 로 시작하고 대국 룸 종류(`game_players`·`game_spectators`)는 Phase 1 에서 **추가만** 한다(`chat-game-sync` 소비자도 Phase 1). 채팅 DoD 의 대국 채팅 항목은 바둑 Phase 와 함께 완료한다. **6a 는 CS 룸(본문 없는 알림 push + REST)만 실행**하고, 평문 본문 push·관전자 비공개·`ChatRoomPolicy` 는 Phase 1 에서 처음 실행된다 | P4 §1·§22 |
| G10 | **CS 에서 배송 정보를 보여 주려면 `fulfillment` 가 필요하다** | 6a(6c 이전) | `OrderContextReader` 가 `shipment: null` 을 돌려주고 UI 는 "배송 정보 없음(준비 중)" 을 표시한다. 6c 도입 때 같은 포트가 배송 추적을 채운다 | P4 §9, P3 |
| G11 | **B12 쌍이 단계마다 하나씩 활성화된다** | 전 단계 | `modules/tx-pairs.json` 은 전체 표를 담되 쌍마다 `activeFrom`(Phase)을 둔다. 활성화 전 쌍의 `InTx` 임포트는 CI 실패, **원자성 계약 시험(롤백 시 타 모듈 변경도 사라짐)은 쌍이 활성화되는 Phase 에서 추가**한다(§2.4) | §2.4 |
| G12 | **`agent`·`operator` 역할의 도입 시점이 갈린다** | 6a, 6c | `agent` 는 6a, `operator` 는 6c 에서 `RolePolicy` 에 추가한다. 일반화된 `RolePolicy`·`ActorContext.roles` 는 6a 에서 한 번에 도입한다(§7.1) | §7.1 |
| G13 | **바둑이 `ledger` 를 새로 만드는 것이 아니라 확장** | Phase 2 | `ledger` 스키마·`PostJournalInTx` 는 Phase 3 에 이미 있다. Phase 2 는 `reward` 상태 머신·`EligibilityPolicy`·`ConfirmRewardInTx`·`FlagRewardInTx` 를 **추가**한다 | §2.5, ADR-037 |
| G14 | **KataGo 스파이크가 맨 뒤에 있다** — 실행 불가가 늦게 드러날 수 있다 | Phase 2 | 바둑 계열(Phase 1·2)이 마지막이라 위험이 늦게 드러난다. 완화: **KataGo 실행 가능성 스파이크(P1 §18 #8)를 Phase 1 착수 전에 한 번 실행하는 것을 제안**(구현 없이 측정만)하고, 안 되면 Phase 2 를 모의 분석기(`ReplayAnalyzer`)로 대체할지 설계 재검토에서 결정한다 | P1 §9·§18 |
| G15 | **지갑 연결 시점** — 지갑 없이도 모든 구매가 되어야 하고, 온체인 시연(6d)은 지갑이 있는 사용자만 | Phase 6d | 지갑은 선택이다(D26). `identity.wallet_link` 는 6d 착수 시 추가 마이그레이션(§7.3). 그 전에는 원장 모의 잔액만 쓴다 | §7.3, P2 §8.7 |

## 2. 모듈 지도 확장

### 2.1 모듈 표 (제안)

'Phase' 열은 로드맵 Phase 번호이며 구현 순서는 §1.1·D24 를 따른다.

| 모듈 | Phase | 쓰기 스키마 / 읽기 스키마 | 구독 이벤트(소비자) | 발행 이벤트 | 동기 의존(공개 usecase·포트) |
|---|---|---|---|---|---|
| identity | M1 (+6) | `identity` | — | — | — |
| events | M1 | `events` | — | — | — |
| observability | M1 | — | — | — | — |
| guestbook | M1 | `guestbook` / `_read` | — | `entry.*` 등 | identity, events |
| realtime | M1 (+6a: 룸 포트·`/ws/room`) | `realtime` / `realtime_read` | 도메인 변경(브로드캐스터) | — | identity (+ 소유 포트 §6.6) |
| **game** | 1 (구현 순서 6) | `game` / `game_read` | — | `game.*` | identity, events |
| **chat** | 6a(코어·CS 룸) · 1(대국 룸 종류) | `chat` / `chat_read` | `game.*`(방 수명), `report.*` | `chat.*` | identity, events (`RoomAccessPolicy` 는 **realtime 소유 포트**이고 chat 은 `ChatRoomPolicy` 구현을 조립부에 등록 — §6.6) |
| **analysis** | 2 | `analysis` | `reward.pending_created`(작업 생성, 색별 reward 와 함께) | `analysis.completed`·`analysis.failed` | game(조회 포트 `GetGameRecord`), events, ledger(`ConfirmRewardInTx`·`FlagRewardInTx`, B12 쌍 #6) |
| **ledger** | 3(도입, POINT·USDC 지급·교환·혼합 결제) · 2(바둑 보상) · 5(KRW) | `ledger` / `_read` | `game.finished`(`EligibilityPolicy` 판정 후 보상 `PENDING` 생성) | `reward.pending_created`·`reward.*`·`ledger.journal_posted`·`ledger.demo_granted`·`ledger.points_exchanged` | events (공개 `*InTx`: `PostJournalInTx`·`ReverseJournalInTx`·`ConfirmRewardInTx`·`FlagRewardInTx`, §2.5) |
| **catalog** | 3 | `catalog` / `_read` | — | `product.*` | identity(관리자) |
| **deal** | 3 | `deal` / `_read` | `order.*`(확정·취소) | `deal.*` | catalog, events, 포트 `StockReservation`(Redis, ADR-024) |
| **order** | 3 (+5) | `order` / `_read` | `payment.*`, `deal.*`, `fulfillment.*`·`return.*` | `order.*` | deal(`ConfirmStockInTx`, 쌍 #2), ledger(`PostJournalInTx`, 쌍 #3), 포트 `PaymentRecordPort`·`EscrowHoldPort`(쌍 #4·#5, payment·escrow 가 구현), catalog, identity |
| **pricefeed** | 3(최소 `FixedRateSource`) · 5(실제 소스·교차 검증) | `pricefeed` | — | `price.*` | — |
| **payment** | 3(원장 결제·환불) · 5(카드·웹훅·환불 확장) | `payment` / `_read` (+웹훅 inbox) | `order.*`, `fulfillment.rejected`·`fulfillment.cancelled`·`return.inspected`(소비자 `payment-fulfillment-refunder`) | `payment.*`·`quote.*` | order(조회 `GetPayableOrder`, `MarkRefundedInTx` 쌍 #7), ledger(쌍 #7), escrow(`RefundInTx` 쌍 #7), 포트 `PaymentGateway` |
| **escrow** | 3(최소: hold·release·refund) · 5(분쟁·동결·정산·자동 확정 타이머) | `escrow` / `_read` | `shipment.delivered`, `shipment.delivery_failed`, `order.return_requested`, **`return.inspected`**(`REJECTED` 면 `frozen→held`), `payment.refunded` | `escrow.*` | ledger(`PostJournalInTx`, 쌍 #8) |
| **settlement** | 5 | `settlement` / `_read` | `payment.*`, `escrow.*` | `settlement.*` | pricefeed(견적 조회), ledger(`PostJournalInTx`, 쌍 #9), events |
| **inventory** | 6c | `inventory` / `_read` | `deal.published`·`deal.settled`·`deal.stock_adjusted`·`deal.restocked`(약정) | `inventory.*` | events |
| **fulfillment** | 6c | `fulfillment` / `_read` | `order.paid`·`order.cancel_requested`·`order.cancelled`·`order.disputed`·`payment.refunded`·`order.return_requested`·`order.address_corrected`, `inventory.*` | `fulfillment.*`·`shipment.*`·`package.*`·`return.*` | order(`GetShippingAddress`, 감사), inventory(`AllocateInTx`·`ReleaseAllocationInTx`·`IssueInTx`·`RecordMovementInTx`, 쌍 #10), 포트 `CarrierAdapter` |
| **support** | 6a | `support` / `_read` | `chat.*`, `order.*` | `support.ticket_*` | chat(`OpenRoomInTx`·`PostMessageInTx`·`CloseRoomInTx`·`AddParticipantInTx`·`RemoveParticipantInTx`, 쌍 #1), order(조회), identity |

### 2.2 층과 의존 규칙 (D16)

| 층 | 모듈 |
|---|---|
| L0 | kernel, protocol, db, config, infra (패키지) |
| L1 | identity, events, observability |
| L2 | realtime, catalog, pricefeed |
| L3 | game, chat, deal, guestbook |
| L4 | analysis, ledger, order, inventory |
| L5 | payment, escrow, settlement, fulfillment, support |

- **동기 호출(공개 usecase·포트)은 피호출 층 ≤ 호출자 층(같은 층 허용)** 일 때만 한다. 상위 모듈에 알려야 할 때는 **이벤트**를 쓰거나 호출자가 포트를 소유한다.
- **포트 의존 역전**: `realtime`(L2)이 `game`(L3)·`chat`(L3)의 상태를 알아야 하는 자리(스냅샷, 접근 판정)는 `realtime` 이 **포트를 소유**하고 상위 모듈이 구현을 `apps/*/compose` 에서 등록한다. 방 접근 판정 포트 `RoomAccessPolicy` 는 **`realtime` 소유**이고 `game`(`GameRoomPolicy`)·`chat`(`ChatRoomPolicy`)·`support`(`CsRoomPolicy`)가 구현을 조립부에 등록한다(chat 이 포트를 정의하거나 game 이 chat 을 임포트하지 않는다, §6.6).
- 검증: dependency-cruiser 규칙 **B12(제안)** — 모듈의 임포트는 자기 층 이하 모듈의 `index` 만. 위반은 CI 실패. **같은 층 호출은 허용되므로 층 규칙만으로는 순환이 막히지 않는다** — 모듈 단위 순환 금지 B5 가 함께 검사한다.

### 2.3 의존 그래프

```mermaid
flowchart BT
    subgraph L1["L1"]
        ID["identity"]
        EV["events"]
        OB["observability"]
    end
    subgraph L2["L2"]
        RT["realtime"]
        CT["catalog"]
        PF["pricefeed"]
    end
    subgraph L3["L3"]
        GM["game"]
        CH["chat"]
        DL["deal"]
        GB["guestbook"]
    end
    subgraph L4["L4"]
        AN["analysis"]
        LG["ledger"]
        OR["order"]
        IV["inventory"]
    end
    subgraph L5["L5"]
        PM["payment"]
        ES["escrow"]
        ST["settlement"]
        FF["fulfillment"]
        SP["support"]
    end
    GM --> ID
    CH --> ID
    DL --> CT
    AN --> GM
    AN --> LG
    LG --> EV
    OR --> LG
    PM --> LG
    ES --> LG
    ST --> LG
    FF --> IV
    RT -. "포트 역전(§6.6)" .-> GM
    OR --> DL
    OR --> CT
    PM --> OR
    PM --> ES
    ST --> PF
    FF --> OR
    SP --> CH
    SP --> OR
    RT --> ID
    GB --> ID
```

(모든 모듈은 `events` 의 outbox/inbox 포트와 `kernel` 도 쓰지만 그림에서는 생략했다. 실선은 직접 임포트(층 규칙 R3), 이벤트 관계는 §8.2, `order → payment/escrow` 는 포트 역전이라 코드 의존 화살표가 반대(`PM → OR`, `ES → OR`)로 나타난다. 모듈 간 한 트랜잭션은 §2.4 허용 쌍만.)

### 2.4 모듈 간 한 트랜잭션 — 트랜잭션 참여 규칙 (B12, **정본**, D21)

> **허용 쌍 10쌍 승인(2026-11-05, U2, 사용자 확정 [권장수용]).**

M1 규약(F16 §8.2)은 "command usecase 만 `uow.run` 을 부르고 중첩을 금지"한다. 그런데 몇몇 흐름은 **여러 모듈의 쓰기를 한 트랜잭션**에 묶어야 불변식을 지킨다(구매 확정의 재고·결제·원장, CS 티켓 전이와 메시지, 분석 결과와 보상 전이). M1 의 `OutboxWriter`·`AuditWriter` 가 이미 "호출자의 tx 에 참여하는 포트"라는 선례다. 이를 일반화하되 **허용 쌍을 표로 한정**한다.

| 규칙 | 내용 |
|---|---|
| R1 참여 함수 | 모듈 `index` 가 내보내는 공개 함수 중 이름이 `…InTx` 로 끝나고 **첫 인자가 `TxContext`** 인 것만 다른 모듈의 트랜잭션에 참여할 수 있다. 이 함수는 `uow.run` 을 호출하지 않고 새 트랜잭션을 열지 않는다(`TxContext` 만 사용). 중첩 `uow.run` 금지(F16 §8.2)는 그대로다 |
| R2 조율자 | 트랜잭션을 연(`uow.run`) command usecase **하나**가 조율자다. 조율자는 R4 허용 쌍에 있는 `InTx` 만 호출한다 |
| R3 층 | 직접 호출은 **피호출 층 ≤ 호출자 층**일 때만. 피호출 층이 더 높으면 호출자가 **포트를 소유**하고(의존 역전) 피호출 모듈이 구현해 조립부(`apps/api/compose`)에서 연결한다 |
| R4 허용 쌍 | 아래 표. **표 밖의 `InTx` 호출은 CI 실패**(dependency-cruiser + 허용 목록 파일 `modules/tx-pairs.json`). 새 쌍은 ADR 개정과 이 표 갱신이 선행 |
| R5 이벤트 | 각 `InTx` 는 자기 모듈의 outbox 이벤트를 **같은 `TxContext`** 로 기록한다(`OutboxWriter`) |
| R6 외부 호출 금지 | `InTx` 안에서 HTTP·PG·체인·KataGo 호출을 하지 않는다(F16 §8.2 "tx 안 외부 호출 금지"). 외부 호출은 트랜잭션 밖에서 하고 결과만 들어온다 |
| R7 읽기 | 조회는 `InTx` 가 아니라 일반 공개 usecase(층 규칙만 적용, 트랜잭션 비참여) |
| R8 실패 | 참여 함수는 `Result` 로 거절을 돌려주고 **조율자가 롤백**한다. 참여 함수가 스스로 커밋·롤백하지 않는다 |
| R9 락 순서 | 한 트랜잭션 안의 행 잠금은 전역 순서 **`reservation → deal.stock → user_purchase → payment → escrow → ledger 계정(id 오름차순) → order`** 로만 잡는다. 확정 tx·환불 tx·정산 tx 의 시퀀스와 ADR-038·ADR-040·P2 §4.7 서술이 모두 이 순서를 따른다(교착 방지) |

**허용 쌍 (정본)**

| # | 조율자(모듈·usecase, 층) | 참여 함수(피호출 모듈, 층) | 방식 | 목적 | Phase |
|---|---|---|---|---|---|
| 1 | support · `OpenTicket`·`ClaimTicket`·`ReleaseTicket`·`ReplyTicket`·`ResolveTicket`·`CloseTicket`·`TicketAutoCloser`·`TicketLeaseReaper` (L5) | chat · `OpenRoomInTx`·`PostMessageInTx`·`CloseRoomInTx`·`AddParticipantInTx`·`RemoveParticipantInTx` (L3) | 직접 | 티켓 상태 전이와 방·참가자·메시지를 원자적으로(상담원 배정/해제 시 참가자 추가·제거 포함) | 6 |
| 2 | order · `ConfirmPurchase` (L4) | deal · `ConfirmStockInTx` (L3) | 직접 | 예약 확정 + 확정 수량 갱신(`confirmed ≤ total` CHECK) | 3 |
| 3 | order · `ConfirmPurchase` (L4) | ledger · `PostJournalInTx` (L4 동층) | 직접 | 포인트·USDC 차감과 에스크로 보류 분개(다리별, 자산별 저널) | 3 |
| 4 | order · `ConfirmPurchase` (L4) | payment · `RecordPaymentInTx` (L5) | **포트 역전**(order 소유 `PaymentRecordPort`) | 결제 기록(다리 포함) | 3(원장 결제)·5(카드 확장) |
| 5 | order · `ConfirmPurchase` (L4) | escrow · `HoldInTx` (L5) | **포트 역전**(`EscrowHoldPort`) | 에스크로 보류 생성(`escrow` + `escrow_leg`) | 3 |
| 6 | analysis · `CompleteAnalysis` (L4) | ledger · `ConfirmRewardInTx`·`FlagRewardInTx` (L4 동층) | 직접 | 분석 결과 저장 + 보상 상태 전이(+기장) | 2 |
| 7 | payment · `RefundPayment` (L5) | ledger · `PostJournalInTx`·`ReverseJournalInTx` (L4), order · `MarkRefundedInTx` (L4), escrow · `RefundInTx` (L5 동층) | 직접 | 환불 = 결제 상태 + 역분개 + 주문 + 에스크로 원자(락 순서는 R9) | 3(환불 도입)·5(카드 환불 확장) |
| 8 | escrow · `ReleaseEscrow` (L5) | ledger · `PostJournalInTx` (L4) | 직접 | 해제 분개 | 3(최소 해제)·5(자동 확정 타이머·동결 해제) |
| 9 | settlement · `ExecuteSettlement` (L5) | ledger · `PostJournalInTx` (L4) | 직접 | 정산 분개 | 5 |
| 10 | fulfillment · `AcceptOrder`(할당 포함, 단일 tx)·`DispatchShipment`/`HandOverShipments`·피킹·패킹·PUTBACK·반품 입고·재입고 작업 (L5) | inventory · `AllocateInTx`·`ReleaseAllocationInTx`·`IssueInTx`·`RecordMovementInTx` (L4) | 직접 | 할당·이동·출고 원장 + 풀필먼트 상태. 다품목은 `sku_id` 오름차순으로 호출(교착 방지) | 6 |

**도입 순서와 시험 시점 (D24)**: 쌍은 구현 순서대로 하나씩 활성화된다. `modules/tx-pairs.json` 은 전체 표를 담되 쌍마다 `activeFrom` 을 둔다.

| 활성화 | 쌍 | 원자성 계약 시험(롤백 시 타 모듈 변경도 사라짐)을 추가하는 시점 |
|---|---|---|
| Phase 3 | #2(order→deal), #3(order→ledger), #4(order→payment, 원장 결제), #5(order→escrow), #7(환불), #8(해제) | Phase 3 (구매 확정·환불 한 트랜잭션) |
| Phase 5 | #4 확장(카드), #5/#7/#8 확장(분쟁·동결·자동 확정), #9(정산) | Phase 5 |
| 6a | #1(support→chat) | 6a (티켓 전이와 메시지) |
| 6c | #10(fulfillment→inventory) | 6c (할당·이동·출고) |
| Phase 2 | #6(analysis→ledger) | Phase 2 (분석 결과와 보상 전이) |

활성화 전 쌍의 `…InTx` 임포트는 `check:arch` 가 실패시킨다. 쌍을 활성화하는 Phase 의 설계 재검토(§12.5)에서 이 표를 다시 확인한다.

**문서화된 CQRS 예외 (X)**: 쓰기 스키마를 읽는 예외는 아래 표가 전부다. 번호는 `X1`, `X2` 로 부르며 ADR-048 의 결정 번호(`E1`~`E8`, 'M-E1…M-E8')와 겹치지 않는다.

| # | 예외 | 근거 | 도입 |
|---|---|---|---|
| X1 | `game_event`(대국 방 로그)를 ws-gateway 의 `RoomEventSource.after`, query usecase `SyncGame`, `GET /api/games/{id}/events` 가 쓰기 스키마에서 직접 읽는다 | 방 로그가 곧 정본 순번이고 fast lane 이 이를 읽어야 지연 예산을 지킨다(§6.7) | Phase 1 |
| X2 | ws-gateway 의 chat `RoomSnapshotProvider`/`RoomEventSource` 구현이 읽기 모델 지연에 대비해 쓰기 모델 `chat.room.last_seq` 로 `head` 를 읽는다(구독 먼저 등록 → head → 읽기 모델 대기·재시도) | 읽기 모델이 `head` 보다 늦어도 재개 순번이 어긋나지 않게 | 6a |

**미사용 예약**: 쌍 #11(`AppendRoomLogInTx`, realtime 방 로그 — §6.7 2차 대응)은 **현재 허용 목록에 없다**. 룸 지연 예산 초과가 측정으로 확인될 때만 ADR-030 개정과 함께 추가한다.

**허용하지 않는 것(이벤트로만)**: `game → ledger`(상위 층), `game → chat`, `game → analysis`(대국 종료는 `game.finished` 이벤트로 알린다), `fulfillment → order`(상태는 이벤트로 알림), `inventory → deal`(약정 상한은 이벤트 `inventory.earmark_changed`), `realtime → 도메인`(포트 역전, §6.6).

```mermaid
sequenceDiagram
    participant A as 조율자 usecase (order.ConfirmPurchase)
    participant U as UnitOfWork
    participant D as deal.ConfirmStockInTx
    participant P as PaymentRecordPort (payment 구현)
    participant E as EscrowHoldPort (escrow 구현)
    participant L as ledger.PostJournalInTx
    participant O as OutboxWriter
    A->>U: run(tx)  (단 한 번)
    Note over U: 락 순서(R9) reservation, deal.stock, user_purchase, payment, escrow, ledger 계정(id 오름차순), order
    U->>D: ConfirmStockInTx(tx, reservationId, qty)
    D-->>U: Result (0행이면 Rejected)
    alt 거절
        U-->>A: 롤백 (다른 모듈 변경도 함께 사라짐)
    else 승인
        U->>P: RecordPaymentInTx(tx, payment, legs)
        U->>E: HoldInTx(tx, escrow, legs)
        U->>L: PostJournalInTx(tx, journal) (자산별 1건)
        U->>O: append(tx, 각 모듈 이벤트)
        U-->>A: 커밋 (order 행 갱신은 마지막)
    end
```

**검사와 시험**: ① `modules/layers.json`(모듈→층)과 `modules/tx-pairs.json`(R4 표)을 정본 파일로 두고 `check:arch` 스크립트가 dependency-cruiser 결과와 대조한다 — 규칙: (a) 타 모듈 임포트는 `index` 만, (b) 직접 임포트의 피호출 층 ≤ 호출자 층, (c) `…InTx` 심볼 임포트는 `tx-pairs.json` 에 있는 (호출자 모듈→피호출 함수)만 — 예: `{"support":["chat.OpenRoomInTx","chat.PostMessageInTx","chat.CloseRoomInTx","chat.AddParticipantInTx","chat.RemoveParticipantInTx"],"fulfillment":["inventory.AllocateInTx","inventory.ReleaseAllocationInTx","inventory.IssueInTx","inventory.RecordMovementInTx"],…}`, (d) `*-in-tx.ts` 파일은 `UnitOfWork`·`.run(` 을 임포트/호출하지 않는다. ② 쌍마다 **원자성 계약 시험**: 조율자 트랜잭션을 도중에 강제 롤백하면 피호출 모듈의 변경·outbox 도 남지 않는다(F13 `faults` 훅). ③ 허용 목록 밖 호출을 심은 샘플이 CI 에서 실패한다.

### 2.5 `ledger` 모듈 — 하나의 복식 원장 (D20)

| 항목 | 내용 |
|---|---|
| 소유 | `ledger` 모듈 하나. 스키마 정본은 [ADR-040](../../adr/ADR-040-escrow-settlement-and-ledger.md)(`account`·`journal`·`posting`·`account_balance`), POINT 자산 규칙과 보상(`reward`) 상태 머신은 [ADR-037](../../adr/ADR-037-simulated-points-ledger.md) |
| 자산 | `POINT`·`USDC`(모의, **Phase 3 에서 도입** — 혼합 결제·첫 로그인 지급·교환), `KRW`(Phase 5, 모의), devnet 거울 USDC(6d 체인 어댑터). 분개는 **자산별로** 차변 합 = 대변 합 |
| 불변식 | 추가 전용, 지연 제약 트리거로 자산별 차변=대변, 정정은 역분개(`reversal_of_id`), 멱등 키 유일 |
| 음수 방지 | **계정 유형별 규칙**: 사용자 계정(`liab:user_*`)은 `min_balance = 0` — 잔액 조건부 갱신(`balance + Δ >= min_balance`); 시스템 계정은 유형별로 정하며 **정본은 ADR-040 의 계정 유형 표**(`exp:*`·`rev:*`·`fx:*` 하한 없음, `liab:escrow:*`·`liab:seller_payable:*`·`asset:*` 규칙 포함) |
| 공개 `InTx` | `PostJournalInTx(tx, JournalInput)`, `ReverseJournalInTx(tx, journalId, reason)`(Phase 3), `ConfirmRewardInTx(tx, rewardId, expectedVersion)`, `FlagRewardInTx(tx, rewardId, report)`(Phase 2) — 시그니처 `(tx: TxContext, …) => Result<…, LedgerError>` |
| 보상 | `reward` 상태 `PENDING → CONFIRMED / FLAGGED → (수동) CONFIRMED / REVOKED`. **생성은 `ledger` 가 `game.finished` 를 소비해** `EligibilityPolicy`(ledger 소유, 입력은 `game.finished` 페이로드)로 자격을 판정한 뒤 `PENDING` 행을 만들고 `reward.pending_created` 를 발행한다(자격 미달이면 reward 도 분석도 없음). 확정 = `exp:points_issued`(POINT) 차변 / `liab:user_points:{uid}`(POINT) 대변 분개와 같은 트랜잭션. `PENDING`·`FLAGGED` 동안은 잔액 불변이고 **`CONFIRMED` 는 종결**이다. `FLAGGED → REVOKED` 는 PENDING 을 무효화할 뿐 **기장이 없다**(확정 보상의 역분개나 음수 잔액 허용은 없다) |
| 자산 출처 (D24·D25) | ① **첫 로그인 지급**(Phase 3~): `ClaimWelcomeGrant` — POINT 100,000(USDC 는 `WELCOME_GRANT_USDC_MICRO`, 라이브 기본 0), 사용자당 1회, `exp:demo_grant:*` / `liab:user_{points\|usdc}:{uid}` ② **관리자 지급** `AdminGrant` ③ **USDC→POINT 단방향 교환** `ExchangeUsdcToPoint`(`exp:points_exchanged:POINT`·`rev:point_exchange:USDC`) ④ **바둑 보상**(Phase 2~, 마지막): `exp:points_issued`. 모두 같은 모듈 안 usecase(새 B12 쌍 없음), 감사·속도 제한·"모의" 표시, 출처는 **계정으로 구분**해 대사한다. **총 발행 상한**은 `ledger.supply_cap(asset, issued, cap)` 단일 행에 `UPDATE … SET issued = issued + :amt WHERE issued + :amt <= cap` 로 원자 강제한다(지급·바둑 보상과 교환으로 발행되는 POINT 모두 포함; `cap` 은 `numeric(40,0)` 이고 값은 signed 64-bit 최대로 실질 무제한 — 구조 방어로만 남고 남용 방어는 사용자당 1회 지급과 속도 제한이 맡는다, U25). 첫 로그인 지급의 유일성은 `ledger.grant` 의 `UNIQUE (github_id, kind)` 이고, 지급은 사용자 생성 tx 와 분리된 **멱등 별도 tx** 로 한다(로그인 성공을 지급 실패와 묶지 않기 위함 — 재호출은 멱등 키가 흡수). 저널은 자산별 1건이며 멱등 키에 `:{asset}` 접미를 붙인다. 금액·한도는 §16 U24~U27 |
| 이벤트 | `reward.pending_created`, `reward.confirmed·flagged·revoked`, `ledger.journal_posted`(§8.3) |
| 모의 표시 | 모든 금액 응답에 `X-PF-Mock: 1`, 화면에 "모의" 배너(D18, ADR-015) |

## 3. 서비스 분리 기준 (ADR-030)

### 3.1 5축 기준

| 축 | 분리를 정당화하는 신호 |
|---|---|
| 독립 확장 | 다른 모듈과 확장 비율이 크게 다르다(연결 수 vs CPU vs 처리량) |
| 언어/런타임 | 다른 언어·네이티브 바이너리가 필수다 |
| 자원 프로파일 | 상주 메모리·CPU 점유가 사이트 전체를 위협한다 |
| 장애 격리 | 이 모듈의 장애/폭주가 다른 모듈로 번지면 안 된다 |
| 배포 주기 | 훨씬 자주 또는 훨씬 드물게 배포된다 |

**규칙**: 둘 이상이 **강하게** 해당하면 분리를 검토하고, 하나만 해당하면 **엔트리포인트 분화**(같은 이미지)로 먼저 푼다. 분리의 비용(서비스 간 계약, 분산 장애, 무료 자원)은 항상 함께 적는다.

```mermaid
flowchart TD
    A["분리 후보"] --> B{"5축 중 강하게 해당?"}
    B -- "0~1개" --> C{"1개?"}
    C -- "예" --> D["엔트리포인트 분화 (같은 이미지)"]
    C -- "아니오" --> E["모놀리스 모듈 유지"]
    B -- "2개 이상" --> F{"무료 자원·계약 비용 감수 가능?"}
    F -- "예" --> G["별도 프로세스·이미지"]
    F -- "아니오" --> D
```

### 3.2 후보별 판정

| 후보 | 확장 | 런타임 | 자원 | 격리 | 배포 | 판정 |
|---|---|---|---|---|---|---|
| **KataGo 분석 워커** | 강(CPU 바운드) | **강**(C++ 바이너리·모델 파일) | **강**(코어 점유) | 강(폭주 시 사이트 영향) | 약 | **분리(D2)** — 별도 프로세스·이미지. 큐는 DB 선점(Phase 2) |
| 룸 실시간(대국·채팅) | 중(연결 수) | 없음(TS 가능, M1 실측 통과) | 약 | 중 | 약 | 엔트리포인트 분화(D3) — `/ws/room` 이 존재하는 6a 이후 재평가(`--surface=room`, D24) |
| WMS(풀필먼트) | 약 | 없음 | 약 | 약 | 약 | **모듈 유지** |
| 채팅 | 중(연결) | 없음 | 약 | 약 | 약 | 모듈 유지 + 룸 채널 |
| 결제 웹훅 수신 | 약 | 없음 | 약 | 중(폭주 방어) | 약 | **모듈 유지**, `api` 의 `/api/webhooks/*` → inbox 저장 후 202(처리는 비동기) |
| 정산·시세 수집 | 약 | 없음 | 약 | 약 | 약 | 모듈 유지(worker 잡) |
| 룰 엔진 | — | **P1 판단**(ADR-012) | — | — | — | 공유 TS 패키지 vs Go 서비스는 P1 이 정한다. P0 요구: **`RuleEngine` 포트 뒤**, 서버 권위 |

- KataGo 분석 워커의 코드는 **같은 모노레포**에 두고(래퍼·큐 소비·결과 기록), KataGo 바이너리/모델은 별도 이미지 레이어다. "서비스 분리"는 프로세스·이미지·자원 한도의 분리이지 레포 분리가 아니다.
- 이 분리가 **이 프로젝트의 첫 번째 실제 서비스 분리**이며, "모놀리스로 시작해 필요가 증명된 지점만 분리했다"는 서사의 근거가 된다.

## 4. 이벤트 전달 계층 (ADR-031 — ADR-006 후속 제안)

### 4.1 왜 시점을 바꾸는가

ADR-006 은 "Phase 2 착수 전 측정"을 요구했다. 그런데 Phase 2 의 소비자(KataGo 워커)는 **DB 선점 큐로 충분**하다(`analysis_job` 선점→트랜잭션 밖 분석→토큰 완료, ADR-021). Redis 가 실제로 필요해지는 것은 **Phase 3**(재고 Lua)이고, 전달 계층이 정말 부하를 받는 것도 **타임딜 버스트**다. 그래서 **Redis 와 Streams 의 판정을 Phase 3 의 부하 시험으로 옮긴다.**

### 4.2 선택지

| 안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| A. 끝까지 Postgres 폴링(+NOTIFY) | 가장 단순, 유실 없음(DB 가 보장), 컨테이너 0 | 버스트 시 폴링·DB 부하, 외부 소비자 확장 제한 | **기본값(M1~Phase 2)** |
| B. Redis Streams (소비자 단위 선택) | 컨테이너 추가 없음(Phase 3 에 어차피 Redis), 낮은 지연, 소비자 그룹·pending 회수 | 내구성 설정 의존(AOF everysec 시 최대 약 1초분 유실 가능, 공식 문서 기준 기억 — 구현 시 재확인), 장애 영역 공유 | **Phase 3 측정 후 채택 판정** |
| C. Kafka | 업계 표준, 서사 | 메모리·운영 비용(무료 자원), 규모 대비 과함 | **기각**(재검토 조건 §4.7) |
| D. NATS JetStream | 가벼움 | 이 저장소에 경험·스킬 없음, 컨테이너 추가 | 기각 |

### 4.3 결정 (D4·D5)

1. **정본은 Postgres outbox.** 어떤 전달 계층을 쓰든 이벤트는 outbox 에 같은 트랜잭션으로 먼저 기록된다(ADR-005).
2. **`EventTransport` 어댑터는 소비자 단위로 고른다.** 소비자 설정 `transport: postgres | streams`(기본 `postgres`). 같은 이벤트가 소비자별로 다른 경로를 탈 수 있다.
3. 발행 완료(`published`)의 의미는 **"전달 계층이 받았다"**(Postgres 경로: inbox INSERT 성공, Streams 경로: `XADD` 성공).
4. **`TransportReconciler`** 가 `XADD` 성공 후 Redis 가 유실한 이벤트를 복구한다(§4.5).

### 4.4 Streams 설계 (잠정, 측정 후 확정)

| 항목 | 설계 |
|---|---|
| 스트림 키 | 모듈당 1개: `pf:evt:<module>` (예 `pf:evt:deal`). 순서 보장 범위 = 모듈 내 스트림 순서 |
| 메시지 | 필드 `id`(이벤트 id), `seq`, `type`, `env`(봉투 JSON 전체). 소비자는 `env` 로 05 §1 의 봉투를 그대로 복원 |
| 소비자 그룹 | 그룹 이름 = inbox 소비자 이름(`deal-confirm-consumer` 등). 소비자 인스턴스 이름 = `<host>-<pid>` |
| 수신 | `XREADGROUP … >` → `ReceiveMessage`(inbox 저장, 중복 무시) → **저장 성공 후 `XACK`** (처리가 아니라 저장 후 ack, ADR-020) |
| 회수 | `XAUTOCLAIM`(유휴 > 60초, 제안)로 죽은 소비자의 pending 인수. 재전달은 inbox 유일 키가 흡수 |
| 트림 | `XADD … MAXLEN ~ N`(근사). N = 처리 중 + 여유: 기본 50,000(제안). **outbox `published` 확인 전에는 트림하지 않는다**는 보장은 정본이 outbox 에 있어 불필요 — 트림으로 잃은 메시지는 Reconciler 가 outbox 에서 재전달 |
| 내구성 | AOF `appendfsync everysec`(제안) + `maxmemory-policy noeviction`. 유실 가능 구간은 최대 약 1초분(공식 문서 기준 기억, **구현 시 재확인**) |
| 역압 | 디스패처가 `XLEN` 이 고수위(N×0.8)를 넘으면 해당 스트림 `XADD` 를 일시 중지하고 outbox 에 쌓아 둔다(Postgres 가 버퍼). 지표 `pf_transport_stream_length` |
| 순서 | 같은 집합체의 이벤트는 같은 스트림에서 순서대로. 소비자 동시성이 2 이상이면 inbox 의 집합체 선두 규칙(F13)이 순서를 지킨다 |

### 4.5 유실 방어 — TransportReconciler

`XADD` 성공 ≠ 디스크 반영이므로, Redis 가 재시작하며 최근 이벤트를 잃으면 outbox 는 `published` 인데 inbox 에는 없다.

```mermaid
flowchart TD
    T["30초마다"] --> Q["최근 10분의 outbox published 중<br/>transport=streams 소비자의 inbox 행이 없는 것 조회"]
    Q --> E{"있음?"}
    E -- "아니오" --> Z["종료"]
    E -- "예" --> R["해당 소비자 스트림에 재 XADD (같은 id)"]
    R --> M["지표 pf_transport_reconciled_total 증가"]
    M --> L{"10분 넘은 누락?"}
    L -- "예" --> A["경보 TransportLoss (조사 필요)"]
    L -- "아니오" --> Z
```

- 조회는 `(consumer, message_id)` 기본키와 `published_at` 인덱스로 한정된 창만 본다(전체 스캔 금지).
- 재전달이 중복이어도 inbox 유일 키가 한 번만 반영한다(AC-003 과 같은 보장).

### 4.6 측정 계획과 합격 기준 (Phase 3, `deal` 버스트)

| 지표 | 방법 | 합격 기준(제안) |
|---|---|---|
| 처리량·종단 지연 | k6 로 예약→확정 버스트(초당 500건 목표는 미확인, 근거 없음 → 단계별 증가) | Streams 경로 p95 가 Postgres 경로의 **50% 이하**이거나, Postgres 경로가 목표 처리량을 못 맞출 때 |
| 메모리 | 부하 중 Redis RSS | ≤ 256MiB(`maxmemory 256mb` 상한 포함, 제안) |
| 내구성 | 부하 중 `kill -9 redis` 후 복구 | Reconciler 이후 누락 0 |
| 소비자 복구 | 소비자 `kill -9` | `XAUTOCLAIM` 후 처리 완료, 중복 효과 0(AC-003) |
| DB 부하 | Postgres CPU·커넥션 | Postgres 경로 대비 감소 |
| 서사 가치 | — | 사용자가 "Streams 도입 자체"를 목표로 선택하면 위 기준 일부를 완화 가능(기준 완화는 ADR-031 에 기록) |

기준 미충족이면 **Postgres 유지**, Streams 는 폐기하지 않고 포트 뒤 어댑터로만 남긴다.

### 4.7 Kafka 재검토 조건

이벤트 규모가 초당 수천 건을 지속하거나, 이벤트 재생(수일 이상 보존)·다수 독립 소비자 그룹이 필요하거나, Redis 내구성이 Reconciler 로도 부족하다고 측정될 때. 현재 규모(동시 접속 50~수백)에서는 해당하지 않는다.

### 4.8 무중단 전환 (Postgres → Streams, 소비자 단위)

```mermaid
sequenceDiagram
    participant D as 디스패처
    participant O as outbox
    participant I as inbox (Postgres)
    participant R as Redis Stream
    participant C as 소비자 러너
    Note over D,C: 1단계 설정 transport=postgres (현재)
    D->>O: 선점
    D->>I: inbox INSERT
    Note over D,C: 2단계 그림자 (transport=postgres + shadow=streams)
    D->>I: inbox INSERT (정본 경로)
    D->>R: XADD (그림자, 소비하지 않음)
    D->>D: 길이·id 비교 지표 pf_transport_shadow_mismatch_total
    Note over D,C: 3단계 전환 (transport=streams)
    D->>R: XADD
    R-->>C: XREADGROUP
    C->>I: ReceiveMessage (inbox 저장)
    C->>R: XACK
    D->>O: published
    Note over D,C: 롤백 = 설정만 postgres 로 (outbox 정본, inbox 유일 키가 중복 흡수)
```

### 4.9 어댑터 클래스 구조

```mermaid
classDiagram
    class EventTransport {
        <<interface>>
        +publish(envelopes, tx) PublishResult
        +kind() string
    }
    class PostgresInboxTransport {
        +publish(envelopes, tx)
    }
    class RedisStreamsTransport {
        -client RedisClient
        -maxLen int
        +publish(envelopes, tx)
        +consume(group, name, handler)
        +claimIdle(group, idleMs)
    }
    class ShadowTransport {
        -primary EventTransport
        -shadow EventTransport
        +publish(envelopes, tx)
    }
    class TransportRouter {
        +select(consumerName) EventTransport
    }
    class TransportReconciler {
        +runOnce() int
    }
    class ReceiveMessage {
        <<usecase>>
    }
    EventTransport <|.. PostgresInboxTransport
    EventTransport <|.. RedisStreamsTransport
    EventTransport <|.. ShadowTransport
    ShadowTransport o-- EventTransport
    TransportRouter --> EventTransport
    TransportReconciler ..> RedisStreamsTransport
    RedisStreamsTransport ..> ReceiveMessage
    PostgresInboxTransport ..> ReceiveMessage
```

## 5. Redis/Valkey 도입 설계 (D6·D7)

### 5.1 용도와 도입 시점

| 용도 | 도입 시점 | 정본 | 재구성 방법 | 장애 시 거동(ADR-024 확장) |
|---|---|---|---|---|
| 재고 선점 Lua | Phase 3 | Postgres `deal.stock` | `reconcile-stock` 잡: 확정+활성 예약을 Postgres 에서 계산해 Redis 재설정 | **선점 거부**(초과 판매 0 우선, ADR-010) |
| 입장 토큰 버킷(타임딜 진입 제어) | Phase 3 | — (휘발) | 불필요(재충전되는 휘발 상태) | 장애 시 프로세스 메모리 버킷으로 폴백(재고 정합은 `deal.stock` 이 보장) |
| 속도 제한(공유) | Phase 4 (레플리카 ≥2) | — (휘발) | 불필요 | fail-open + nginx 제한 유지 |
| presence | Phase 4 | — (휘발) | 불필요 | 마지막 값 유지/숨김 |
| 세션 검증 캐시 무효화 | Phase 4 | `identity.session` | 불필요 | 캐시 우회(DB 직접) |
| Streams | Phase 3 판정 | Postgres outbox | Reconciler(§4.5) | outbox 가 버퍼, Postgres 경로로 폴백 |
| 룸 팬아웃 다중 인스턴스 | 6a 이후 재평가 (Phase 4 에는 룸 연결이 없다) | 도메인 자체 로그(`game_event`·`chat` 메시지 표) | 불필요 | gateway 가 `NOTIFY` 대신 폴링으로 폴백 |

### 5.2 인스턴스 구성 (D6)

| 선택지 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 단일 인스턴스, 키 접두사 | 자원 최소(유휴 6.8MiB 측정), 운영 단순 | 재고(휘발 허용)와 Streams(내구성 필요)의 정책이 한 설정에 묶임, 장애 영역 공유 | **시작 안(Phase 3)** |
| 인스턴스 2개(상태/스트림) | 정책·장애 분리 | 컨테이너 2개, 관리 부담 | Phase 4 재평가 |
| 논리 DB 번호 분리 | — | 메모리·영속성 정책이 분리되지 않아 효과 없음 | 기각 |

**단일 인스턴스 규칙**: `maxmemory 256mb`(제안), `maxmemory-policy noeviction`, AOF `everysec`, **스트림을 제외한 모든 키는 TTL 필수**(재고 키는 예약 TTL 기준), 키 접두사 `pf:<용도>:<...>`(`pf:stock:`, `pf:rl:`, `pf:pres:`, `pf:evt:`). 접두사 없는 키는 CI 린트(키 생성 헬퍼만 사용)로 금지.

**분리 트리거(Phase 4 재평가)**: Streams 메모리가 재고 키 공간을 압박하거나, 재시작 정책(휘발 허용 vs 내구성)이 충돌하거나, 한 용도의 장애가 다른 용도로 번진 사고가 측정될 때.

### 5.3 Redis 확정 (Valkey 대안은 채택하지 않음)

**Redis 로 확정(U8, 2026-11-05; 권장은 Valkey 였으나 사용자가 변경).** 두 이미지의 유휴 메모리는 비슷하다(redis:8 6.8MiB, valkey 9 5.9MiB, 측정). 최신 버전의 라이선스 조건은 Phase 3 착수 시 공식 문서로 확인한다(미확인).

### 5.4 포트 확장

ADR-024 의 `StockReservation` 포트(이 문서 초안의 `StockStore` 와 **같은 포트, 이름은 `StockReservation` 으로 통일**)의 연산을 구체화한다: `reserve`, `release`, `confirm`, `restock`(출고 전 취소 시 재고 복원, `deal.restocked`), `peek`. `SlidingWindowLimiter` 는 기존 `RateLimiter` 구현체로 흡수. 메모리/Postgres 어댑터는 시험·단일 인스턴스용으로 남기고 Redis 어댑터가 같은 **포트 계약 시험 스위트**(08 §2.1)를 통과해야 한다.

## 6. 실시간 채널 모델 확장 (ADR-032)

### 6.1 문제

M1 은 `/ws/public`(모두에게 같은 메시지)과 `/ws/private`(세션 소유자에게만)이다. 바둑·채팅은 **"특정 룸의 참가자/관전자에게만"** 가는 메시지가 필요하다. 룸은 수가 많고 수명이 짧으며(대국 한 판), 권한이 룸마다 다르다.

**도입 시점 (D24)**: `/ws/room` 의 **첫 사용처는 6a(CS 채팅)** 이다 — `chat:*`·`cs:*` 룸으로 시작한다. 이때 `RoomAccessPolicy`·`RoomSnapshotProvider`·`RoomMessageMapper` 포트와 `ChatRoomPolicy`·`CsRoomPolicy` 구현, 방 구독·재개·백프레셔의 일반화(F14 `PublicHub`→`RoomHub`)가 들어간다. **대국 룸(`game:*`)은 Phase 1 에서 같은 연결에 `GameRoomPolicy`·`RoomEventSource`(자체 `game_event` 로그)만 추가**한다. Phase 3~5 의 구매 결과·재고 카운트는 `/ws/private`·`/ws/public` 으로 충분하다.

### 6.2 선택지

| 안 | 설명 | 장점 | 단점 | 판정 |
|---|---|---|---|---|
| **A. `/ws/room` 세 번째 연결** | 인증 필수, 한 연결에 여러 룸 구독 | 장애·백프레셔 격리(룸 폭주가 사이트 채널에 영향 없음), M1 `public`/`private` 불변, 룸 수만큼 연결을 늘리지 않음 | 탭당 소켓 최대 3개 | **채택(D8)** |
| B. `/ws/private` 에 다중화 | 기존 private 에 룸 구독 추가 | 소켓 수 증가 없음 | private 의 단순성(세션 소유자 전용, 재개 없음) 훼손, 룸 폭주가 개인 흐름 지연 | 기각 |
| C. 룸마다 연결 | `/ws/room/<id>` | 구현 단순 | 관전하며 채팅하면 소켓 2+, 연결 폭증, 사용자 결정(public/private 분리)의 정신과 다름 | 기각 |
| D. 모두 한 소켓 | 채널 필드로 다중화 | 소켓 1개 | 사용자 결정으로 이미 기각(public/private 분리) | 기각 |

### 6.3 프로토콜 (04 의 봉투 확장)

- 연결 시점: **룸이 필요한 화면 진입 시**(로비·대국·채팅). 세션 필수(익명 세션 포함). `Origin` 검사·연결 수 제한은 04 §1 과 같다.
- 쓰기는 **REST**(D8, ADR-018): 착수·채팅 전송·신고는 멱등 키가 있는 `POST` 로 하고, 결과는 룸 채널로 push 된다.
- 클라이언트→서버(허용 목록 전부): `hello`(M1 과 같음), `room.join { room, resume? }`, `room.leave { room }`, `ping`, 그리고 채팅 방 한정 휘발성 `typing`. 그 밖의 인바운드는 `room.error { code: inbound_not_allowed }`(반복 시 `4400`).
- 서버→클라이언트: 봉투에 `ch:'room'`, `rm:'<type>:<id>'` 를 추가. 종류 `room.joined { room, role, head, mode: live|replay|snapshot }`, `room.snapshot { room, data, head }`, `replay.end`, 휘발성 `room.presence`·`room.typing`, 도메인 메시지(`game.move`, `chat.message` 등 — 영역 설계가 정의), `room.closed { room, reason }`(권한 상실·룸 종료), `room.error`.
- 룸 키(정본): `<type>:<uuid>` — `game:<gameId>`(대국 룸), `chat:<chatRoomId>`(채팅 룸; 대국 채팅은 game 에 연결된 **별도 chat 룸 2개**(players·spectators)이며 각각 자기 uuid), `cs:<ticketId>`(CS 티켓 룸). 필드 이름은 `room`(요청·응답 공통, `roomId` 아님), 서버→클라이언트 봉투의 `rm` 는 같은 키. 타입별 권한은 `RoomAccessPolicy` 가 판정한다. 영역 문서(P1·P4)는 이 형식과 메시지 이름(`room.join`/`room.joined`/`room.snapshot`/`room.presence`/`room.closed`/`room.error`)을 따른다.

### 6.4 순번·재개 일반화

| M1 (public) | 룸 |
|---|---|
| `realtime_read.change_log (channel, seq)` + `channel_seq` | `realtime_read.room_log (room_key, seq)` + `room_seq (room_key, last_seq)` |
| 보관: 1시간/1만 행 | 룸별: 최근 1시간 또는 1,000 행 중 먼저 닿는 쪽. 룸 종료 + 1시간 후 해당 룸의 행·카운터 삭제 |
| 이력 없으면 전체 스냅샷 | 이력 없으면 **`RoomSnapshotProvider`(도메인 소유)가 만든 스냅샷**. 대국은 정본(`move` 표)에서, 채팅은 최근 N건에서 만든다 |
| 클라이언트: `SeqTracker` | 룸별 `SeqTracker` |

- seq 부여 방식(카운터 행 `UPDATE … RETURNING`, 커밋 순서 = seq 순서)은 M1 과 같다. **도메인이 자체 순번 로그를 가진 룸**은 그 순번이 방 순번이며 `room_log`/`room_seq` 를 쓰지 않고 `RoomEventSource`(재생 원천)로 읽는다(§6.6). 두 가지 경우가 있다: (a) **대국** — `game_event` 가 로그이고 push 도 명령 tx 의 `pg_notify('room_changed')` fast lane(§6.7); (b) **채팅** — `chat` 메시지 표(명령 쪽 방 카운터 seq, ADR-045)가 로그이고 재생은 `RoomEventSource`(읽기 모델 `chat_read.message_view`)로 하되 **push 는 표준 경로**(outbox → chat-broadcaster → `NOTIFY chat_room_changed`)이며 `room_log` 에 쓰지 않는다. `room_log` 는 **자체 로그가 없는 룸 종류용(현재 해당 없음, 예약)** 이다. 룸 카운터 행은 룸 생성 시 만들고 룸 종료 정리 때 삭제한다.
- **정본은 도메인 표**다(`move`, `chat_message`). `room_log` 는 전달 편의용 이력이고 유실돼도 스냅샷으로 복구된다.

### 6.5 권한 판정

```mermaid
sequenceDiagram
    participant C as 브라우저
    participant G as ws-gateway room
    participant P as RoomAccessPolicy (도메인 구현)
    participant S as RoomSnapshotProvider
    participant L as RoomEventSource 도메인 로그 또는 room_log
    C->>G: room.join { room: "game:7f…", resume: 41 }
    G->>P: decide(actor, room)
    alt 허용 (참가자·관전자)
        P-->>G: allow { role: spectator }
        G->>L: seq > 41 조회
        alt 재생 가능
            L-->>G: 42..45
            G-->>C: room.joined { mode: replay, head: 45 }
            G-->>C: 메시지 42..45
        else 이력 부족
            G->>S: snapshot(room, actor)
            S-->>G: 상태
            G-->>C: room.joined { mode: snapshot } + room.snapshot
        end
    else 거부
        P-->>G: deny
        G-->>C: room.error { code: forbidden }
    end
    Note over G,C: 이후 이 룸의 변경만 push
```

- 참가 자격이 바뀌는 이벤트(킥, 대국 종료 후 채팅 권한 변경)는 `RoomAccessPolicy` 가 재판정하며, 실패 시 서버가 `room.closed` 로 구독을 해제한다.
- 룸별 가시성(관전자에게 숨길 것, 예: 대국 중 개인 메모)은 `RoomMessageMapper` 가 **수신자 역할별로 변환**한다(공개 변환과 같은 허용목록 방식, AC-009 의 확장).

### 6.6 클래스 구조

```mermaid
classDiagram
    class RoomAccessPolicy {
        <<interface>>
        +decide(actor, roomKey) AccessDecision
    }
    class RoomSnapshotProvider {
        <<interface>>
        +roomType() string
        +snapshot(roomKey, actor) Snapshot
    }
    class RoomMessageMapper {
        <<interface>>
        +roomType() string
        +toRecipient(change, role) WsMessage
    }
    class RoomEventSource {
        <<interface>>
        +roomType() string
        +after(roomKey, seq, limit) RoomEvent[]
        +head(roomKey) int64
    }
    class RoomRegistry {
        +register(type, policy, provider, mapper, source)
        +policyOf(type) RoomAccessPolicy
    }
    class RoomHub {
        +subscribe(conn, roomKey, role)
        +unsubscribe(conn, roomKey)
        +publish(roomKey, change)
    }
    class RoomSocketHandler {
        +onSub(conn, msg)
        +onUnsub(conn, msg)
    }
    class RoomLogWriter {
        +append(roomKey, type, payload) int64
    }
    class RoomSubscription {
        +roomKey string
        +role string
        +lastSeq int64
    }
    class GameRoomPolicy
    class ChatRoomPolicy
    class CsRoomPolicy
    RoomAccessPolicy <|.. GameRoomPolicy
    RoomAccessPolicy <|.. ChatRoomPolicy
    RoomAccessPolicy <|.. CsRoomPolicy
    RoomRegistry o-- RoomAccessPolicy
    RoomRegistry o-- RoomSnapshotProvider
    RoomRegistry o-- RoomMessageMapper
    RoomRegistry o-- RoomEventSource
    RoomHub ..> RoomEventSource
    RoomSocketHandler --> RoomRegistry
    RoomSocketHandler --> RoomHub
    RoomHub --> RoomSubscription
    RoomHub ..> RoomLogWriter
```

**`RoomAccessPolicy`·`RoomSnapshotProvider`·`RoomMessageMapper`·`RoomEventSource` 는 모두 `realtime`(L2) 소유 포트**다. `GameRoomPolicy`(game)·`ChatRoomPolicy`(chat)·`CsRoomPolicy`(support) 등은 각 도메인 모듈이 구현하고 `apps/ws-gateway/compose` 가 `RoomRegistry` 에 등록한다(D9). 포트를 chat 같은 도메인이 정의하거나, game 이 chat 을 임포트해 접근을 판정하는 구성은 층 규칙(R3)과 `game → chat` 금지에 어긋나므로 쓰지 않는다. 게이트웨이는 도메인의 읽기 모델(`chat_read` 등)을 직접 조회하지 않고 위 포트로만 읽는다.

### 6.7 지연 예산과 fast lane (D10)

M1 경로는 `명령 tx → outbox → 디스패처 → inbox → 브로드캐스터 → room_log+NOTIFY → gateway → 클라이언트` 로 여러 홉이다. 룸 이벤트(착수·채팅)는 사용자가 즉시 보는 값이다.

| 단계 | 방식 |
|---|---|
| 예산 | 룸 이벤트 종단 지연 **p95 ≤ 250ms**(제안, **미측정** — 6a 의 채팅 룸에서 1차 측정, Phase 1 의 대국 룸 부하 시험에서 확정) |
| 1차 대응 | 디스패처를 NOTIFY 구동(폴링 대기 없음)으로 돌리고, 룸 이벤트용 브로드캐스터 러너를 별도 동시성으로 둔다 |
| 기본 fast lane (자체 순번 로그를 가진 룸 — 대국) | 명령 tx 가 `pg_notify('room_changed', {room, seq})` 를 추가(커밋 때 전달) → 게이트웨이가 `RoomEventSource.after(room, lastSent)` 로 도메인 로그(`game_event`)를 읽어 push. outbox 는 읽기 모델 투영용으로만 남는다. 모듈 경계 예외 없음(포트 의존 역전) |
| 2차(**미사용 예약**) | 자체 로그가 없는 룸이 예산을 넘는 일이 **측정으로 확인될 때만**: 그 룸의 명령이 같은 트랜잭션에서 `realtime` 의 `AppendRoomLogInTx(tx, …)` 를 호출한다. 이는 모듈 간 한 트랜잭션이므로 **허용 쌍 #11 을 ADR-030 개정과 함께 먼저 추가**해야 하며 그 전까지는 허용 목록에 없다(R4). 현재 대국은 `game_event` 로, 채팅은 표준 경로로 충분하므로 해당 룸이 없다 |

fast lane 은 outbox 정본·멱등 규약을 해치지 않는다(대국은 `game_event` 의 `UNIQUE (game_id, move_id)` 와 순번이, (예약된) `AppendRoomLogInTx` 경로는 `room_log.event_id` 유일 키가 브로드캐스터 경로와의 중복을 흡수). 채팅은 지연 요구가 낮아 표준 경로(P4 §4.4: outbox → chat-broadcaster → NOTIFY, `room_log` 미사용)를 쓴다. **P1 판단 근거와 구간별 추정은 [01-baduk §5.10](01-baduk.md).**

### 6.8 연결 수·팬아웃·백프레셔

| 항목 | 규칙 |
|---|---|
| 탭당 소켓 | 최대 3개(public·private·room). 룸 화면이 없으면 room 연결을 열지 않는다 |
| 연결당 룸 수 | 최대 8 (초과 시 `room.join` 거부, 제안) |
| 구독 속도 | **초당 5회** (`room.join`/`room.leave` 합산, 초과 시 `4429` 종료). **정본 값** — P1·P4 의 `room.join` 한도는 이 값에 맞춘다(방별 분당 한도 등 추가 한도를 둘 때는 이보다 느슨하지 않게 이 문서에 먼저 등재) |
| 룸별 연결 수 | 대국 관전 상한(제안 200), 채팅 룸 상한(제안 200). 초과 시 `room.error { code: room_full }` |
| 직렬화 | 룸 메시지 한 건을 **한 번만 직렬화**해 구독자 전원에게 전송(역할별 변환이 다르면 역할당 1회) |
| 백프레셔 | M1 `SendQueue`(64건/256KB, 초과 시 4408)를 그대로 사용. 합치기 키 `sk` 는 룸 메시지에도 적용(예: 시간 표시 갱신) |
| 용량 | M1 측정: 연결당 증분 약 5.5KB(단시간·앱 큐 제외), 보수적으로 50KB. 총 연결 상한 400 을 룸 연결이 **모두** 차지하는 최악의 경우 → 약 20MB(추정) |
| 총 연결 상한 | `WS_MAX_CONNECTIONS` 초기값 400(site+room 합산 정책은 룸 연결이 생기는 6a 이후 재평가해 분리 상한으로 — Phase 4 에는 룸 연결이 없다) |

### 6.9 presence 소유 (D19)

| 항목 | 규칙 |
|---|---|
| 소유 | `realtime` 모듈. `PresenceCounter` 포트(ADR-024)를 방 범위 키(`room:<type>:<id>`)로 사용하고, `/ws/room` 의 `room.join`·`room.leave`·연결 종료에서만 증감한다 |
| 표시 | `room.presence { room, spectators, players }`(휘발성). 값의 의미는 "현재 이 방을 구독 중인 연결 수(근사)" |
| 읽기 | 도메인 모듈은 `realtime` 의 공개 **읽기** usecase `GetRoomPresence(room)`·`IsParticipantConnected(room, ref)` 만 호출한다(game L3 → realtime L2, 층 규칙 OK). 쓰기 경로는 없다 |
| 용도 | **표시 전용**: game 의 관전자 수·"상대 연결 끊김" 안내 표시, chat 의 접속자 수 표시. **규칙 판정(이탈 `abandoned`, 시간 초과)에 presence 를 근거로 쓰지 않는다**(근사값이며 `PresenceCounter` 는 참가자별 연결 여부를 담지 못함). 이탈 판정은 `game` 이 소유한 신호 — 플레이어가 20초마다 보내는 REST 하트비트가 갱신하는 `game_player.last_seen_at` — 와 자기 타이머로 한다(P1 §5, 결정 S3) |
| 장애 | Redis 도입 후 `PresenceCounter` 가 Redis 어댑터여도 장애 시 마지막 값 유지/숨김(ADR-024), 게임 진행에 영향 없음 |

## 7. ID·권한 확장

### 7.1 역할 (D11)

| 역할 | 얻는 법 | 할 수 있는 것(요약) |
|---|---|---|
| visitor | 익명 세션 | 방명록 쓰기, 공개 대국 관전, 공개 채팅 읽기(룸 정책에 따름) |
| user | GitHub 로그인(Phase 6 에 Passkey 추가) | 대국 참가, 채팅 쓰기, 구매, 본인 주문 조회 |
| agent | `AGENT_GITHUB_IDS` 허용목록(설정, 숫자 GitHub ID) | CS 룸 응대, 티켓 처리, 주문 **조회**(수정 불가, 열람 감사) |
| operator | `OPERATOR_GITHUB_IDS` 허용목록(설정) | 창고 작업(피킹·패킹·출고 스캔, 입고 검수), 작업 큐 열람. 재고 조정 승인·강제 취소는 `admin` |
| admin | `ADMIN_GITHUB_IDS` 허용목록(설정) | 숨김/신고/잠금, 상품·딜 관리, 정산 열람, 창고 관리(조정 승인·예외 해결), 감사 조회 |

- **도입 시점 (D24)**: `RolePolicy`·`ActorContext.roles` 일반화는 **6a**, `agent` 는 6a, `operator` 는 6c 에서 허용목록에 추가한다. 그 전(Phase 3~5)에는 M1 의 `admin` 만 있다(상품·딜·결제 관리).
- **허용목록 방식 통일**: 세 역할 모두 설정 허용목록이며 DB 에 권한을 두지 않는다(M1 ID-09). 역할 변경은 설정 변경 + 재배포이고, 허용목록 변경은 배포 로그와 감사 `system.config_changed`(제안)로 남긴다. 한 사람이 여러 역할을 가질 수 있다(단일 운영자).
- **데모 모드**: 방문자가 `operator`/`agent` 화면을 **샌드박스 데이터로** 체험하게 할지는 사용자 결정(§16). 허용하더라도 별도 `demo_` 스키마 데이터와 쓰기 시뮬레이션만 다룬다.
- **seller 없음**: 단일 판매자이므로 상품·딜·재고 관리는 `admin` 이다. 판매자 포털은 범위 밖(필요 시 Phase 6 이후 별도 ADR).
- `ActorContext` 에 `roles: Set<Role>` 을 추가한다. 가드 `RequireRole(role)` 와 도메인 `Policy` 클래스(소유자·참가자 판정)를 분리한다(M1 `OwnerPolicy` 와 같은 방식).
- 행위자 키(`session:<id>` / `user:<id>`)는 **변하지 않는다.** 역할은 요청마다 계산하는 파생 값이고 이벤트의 `ownerKey` 에 들어가지 않는다.

### 7.2 Passkey (D12, Phase 6)

`identity.credential (id, user_id, credential_id UNIQUE, public_key, sign_count, transports, created_at, last_used_at)`. 로그인 후 같은 방식으로 `session` 을 만든다. 계정 연결: 먼저 GitHub 로 로그인한 사용자가 Passkey 를 추가 등록(계정 단위). 복구·분실 정책은 영역 설계 대상이 아니라 Phase 6b 착수 시 ADR 로 남긴다(미결).

### 7.3 Solana 지갑 연결 (선택, D26 · ADR-048 E6)

`identity.wallet_link (id, user_id, public_key, linked_at, unlinked_at)` — 유일성은 부분 유일 인덱스 `UNIQUE (public_key) WHERE unlinked_at IS NULL`(**공개키 하나는 한 사용자에게만**)과 `UNIQUE (user_id) WHERE unlinked_at IS NULL`(사용자당 활성 지갑 1개). 해제 후 행은 N일(제안 30일) 보관한 뒤 삭제한다. `identity.wallet_challenge (id, user_id, nonce, expires_at, used_at, failed_count)` — 1회용·5분 만료·사용자 바인딩, 사용자별 활성 챌린지는 1개(새 발급이 이전 것을 폐기).

1. `POST /api/me/wallet/challenge` → 서버가 `challengeId` 와 `nonce`(CSPRNG 128비트 이상)를 만들고 메시지(`portfolio-wallet-link:{origin}:{userId}:{nonce}:{expiresAt}`)를 돌려준다. `origin` 은 **서버 설정 상수**이며 요청 헤더에서 취하지 않는다.
2. 지갑이 메시지를 서명 → `POST /api/me/wallet/link {challengeId, publicKey, signature}`. 서버는 **Ed25519 서명을 검증**한다(Bun 의 `node:crypto`·WebCrypto 모두 로컬 실측에서 검증 통과·변조 거부 확인). 검증 성공 후 챌린지를 `used_at IS NULL` 조건부 UPDATE 로 소진해 재사용을 막고, 검증 실패는 `failed_count` 를 올려 5회에 도달하면 챌린지를 폐기한다.
3. 해제는 `DELETE /api/me/wallet`(감사 `system.wallet_linked`/`system.wallet_unlinked`). 세션 폐기(`RevokeSessions`)와 독립이다.

지갑이 없어도 모든 기능이 동작한다. 연결 여부는 6d 의 소액 devnet 에스크로 시연에만 영향을 준다. 공개키는 공개 정보이나 계정과 연결되므로 PSD 로 분류하고, Redactor(로그·오류 응답 마스킹)에 공개키·서명·nonce 를 추가한다. 계정 복구·다중 지갑은 6d 착수 시 ADR.

## 8. 규약 확장과 크로스 도메인 이벤트

### 8.1 규약 (D15)

| 항목 | 규약 |
|---|---|
| 스키마 | 쓰기 `<module>`, 읽기 `<module>_read`. FK 는 같은 스키마 안에서만 |
| 이벤트 이름 | `<aggregate>.<verb-past>`: `game.finished`, `order.paid`, `payment.approved`, `chat.message_posted` |
| 이벤트 버전 | 05 §7 규칙 그대로(`schemaVersion`, 소비자 먼저 배포) |
| 지표 | `pf_<도메인>_<이름>`, 레이블에 식별자(사용자·세션·룸·주문·게임 id) 금지 |
| 오류 코드 | wire code 에 모듈 접두사 없음, 도메인 고유 코드는 `snake_case`(`stock_exhausted`, `quote_expired`) |
| 금액 | 정수 최소단위(KRW 원, USDC 는 6자리 소수 → micro-USDC 정수), 부동소수점 금지 |
| 시각 | UTC `timestamptz`, 서버 시계만 신뢰(대국 시간 제어 포함) |
| ID | uuid v7, 클라이언트 생성 멱등 키(M1 규약) |
| 상태 머신 | 표 기반 허용 전이 + 조건부 UPDATE(`WHERE status = $expected`), 전이 표는 각 영역 설계가 소유 |

### 8.2 크로스 도메인 이벤트 지도 (정본 이름, D22)

```mermaid
flowchart LR
    GM["game"] -- "game.started" --> CH["chat (룸 개설)"]
    GM -- "game.finished" --> CH
    GM -- "game.finished" --> LG["ledger (자격 판정 후 reward PENDING)"]
    LG -- "reward.pending_created" --> AN["analysis (작업 생성)"]
    AN -. "ConfirmRewardInTx / FlagRewardInTx (B12 #6)" .-> LG
    AN -- "analysis.completed / analysis.failed" --> GM
    CH -- "chat.message_reported" --> ADM["관리자 큐"]
    DL["deal"] -- "reservation.confirmed / expired" --> OR["order"]
    DL -- "deal.published / settled / stock_adjusted / restocked" --> IV["inventory (약정)"]
    IV -- "inventory.earmark_changed / earmark_rejected" --> DL
    PM["payment"] -- "payment.approved / failed / refunded" --> OR
    OR -- "order.paid" --> FF["fulfillment"]
    OR -- "order.cancel_requested / cancelled / disputed / return_requested / address_corrected" --> FF
    OR -- "order.return_requested" --> ES
    FF -- "return.inspected (REJECTED 면 frozen→held)" --> ES
    FF -- "shipment.delivery_failed" --> ES
    FF -- "fulfillment.rejected / cancelled, return.inspected" --> PM
    FF -- "fulfillment.* / shipment.* / return.*" --> OR
    FF -- "shipment.delivered" --> ES["escrow (자동 확정 기한)"]
    ES -- "escrow.released" --> ST["settlement"]
    PF["pricefeed"] -. "견적 조회 (동기 읽기)" .-> PM
    IV -- "inventory.allocation_failed" --> FF
    OR -. "주문 요약 읽기 포트" .-> SP["support"]
    CH -- "chat.* (CS 룸)" --> SP
```

- 동기 호출은 점선(읽기 포트와 B12 `InTx`), 실선은 outbox→inbox 이벤트.
- 이벤트는 **다운스트림이 필요로 하는 사실만** 싣고 PII 를 싣지 않는다. 특히 **배송지는 어떤 이벤트에도 싣지 않고 참조(`shippingAddressRef`)만** 싣는다(§9.6).
- 보상 흐름(사가)은 영역 설계가 정의한다. P0 규칙은 **"보상도 이벤트로, 멱등하게"** 이다.

### 8.3 이벤트 계약 정본 표 (D22)

봉투·버전 규칙은 [05](../05-event-catalog.md). 이름은 `<aggregate>.<verb-past>`, 모듈 접두사를 붙이지 않는다. 페이로드는 식별자·금액·상태·수량만 싣는다. **P1~P4 영역 문서는 이 표를 따르고, 다르면 이 표가 이긴다.**

| `type` | 발행(모듈) | 페이로드 v1 요지 | 소비자 | 비고 |
|---|---|---|---|---|
| `challenge.created` · `challenge.cancelled` · `challenge.expired` | game | `challengeId`, 설정 | game-projector | 로비 |
| **`game.started`** | game | `gameId`, 설정, 참가자 표시, `startedAt` | game-projector, **chat**(`chat-game-sync`: 방 개설·플레이어 참가자), trace-recorder | 두 번째 참가자 확정 시. P4 의 `game.created` 는 폐기(이 이벤트로 통일) |
| `game.move_played` · `game.passed` · `game.resigned` · `game.timed_out` · `game.scoring_started` · `game.score_confirmed` | game | `gameId`, `seq`, 좌표/사유 | game-projector | 실시간 push 는 fast lane(`room_changed`), 이 이벤트는 투영용 |
| **`game.finished`** | game | `gameId`, 결과, 종료 사유, 수 수, 규칙, `rated`, 참가자(ownerKey·색), 자격 판정 입력(수 수·종료 사유·같은 상대 반복 횟수), **`undoCount`**(무르기 횟수), **덤(`komi`)**, **`rules`**(`chinese`·`japanese`) | game-projector, **ledger**(`EligibilityPolicy` 판정 후 reward `PENDING` 생성), **chat**(`chat-game-sync`: 플레이어 방 읽기 전용·관전자 방 공개 전환), trace-recorder | **analysis 는 이 이벤트를 직접 소비하지 않는다** — ledger 가 만든 `reward.pending_created` 로 작업을 만든다(자격 미달 대국은 reward 도 분석도 없음). `game.review.requested` 는 폐기 |
| **`game.undo_requested`** · **`game.undo_accepted`** · **`game.undo_declined`** | game | `gameId`, `seq`, 요청/응답 색(`by`), `toPly`·`positionHash`(수락), `requestSeq`, `reason`(거절 `declined`·만료 `expired`·철회 `superseded`) | game-projector | U11 무르기(비레이팅 대국만, P1 §4.5). 실시간 push 는 `game_event` + `room_changed` 경로, 이 이벤트는 투영용 |
| `game.abandoned` | game | `gameId`, 사유 | game-projector, chat(`chat-game-sync`: 방 종료) | 판정 근거는 game 소유 하트비트 신호(P1), presence 아님 |
| `analysis.completed` · `analysis.failed` | analysis | `gameId`, 요약 지표, **색별** `verdicts[{color, rewardId, verdict(CLEAN·SUSPECT), inconclusive?}]` | game-projector(표시) | 보상 전이는 이벤트가 아니라 B12 쌍 #6 으로 같은 tx 에서 수행(reward 별로 자기 색의 판정). 2단계 후에도 INCONCLUSIVE 면 CLEAN 취급(확정)하되 `inconclusive=true` 로 기록·지표·감사 |
| **`reward.pending_created`** | ledger | `gameId`, `rewards[{rewardId, ownerKey, color}]` | **analysis**(작업 멱등 생성, `UNIQUE (game_id)`), ledger-projector | `game.finished` 처리와 같은 tx 에서 발행 |
| `reward.confirmed` · `reward.flagged` · `reward.revoked` | ledger | `rewardId`, 금액(내부), 상태 | ledger-projector | `revoked` 는 PENDING 무효화(기장 없음) |
| `ledger.journal_posted` | ledger | `journalId`, `kind`, `refType`, `refId` | ledger-projector | (P1 의 `ledger.posted` 폐기) |
| `ledger.demo_granted` · `ledger.points_exchanged` | ledger | `userId`, `kind`, `asset`(단수 — 자산별 1건이므로 첫 로그인 지급은 USDC·POINT 각 1건), `amount`(교환은 `pointAmount`·`usdcCostMicro`·`snapshotId`) | 프로젝터 | 개인 알림("모의"). `ClaimWelcomeGrant`·`ExchangeUsdcToPoint` 가 지급·교환 tx 안에서 outbox 로 발행한다(P2 §11) |
| `chat.room_opened` · `chat.room_closed` · `chat.room_revealed` · `chat.participant_added` · `chat.participant_removed` · `chat.participant_muted` · `chat.participant_unmuted` · `chat.message_posted` · `chat.message_hidden` · `chat.message_deleted` · `chat.read_marked` | chat | `roomId`, `seq`, … (CS 방은 본문 없음) | chat-projector, chat-broadcaster(realtime 소유), chat-game-sync 는 소비 측(game.*) | 04 §12 |
| **`chat.message_reported`** | chat | `reportId`, `roomId`, `seq` | chat-projector(관리자 큐) | M1 `report.filed` 와 같은 모양의 모더레이션 흐름 |
| `support.ticket_opened` · `support.ticket_claimed` · `support.ticket_released` · `support.ticket_first_replied` · `support.ticket_resolved` · `support.ticket_reopened` · `support.ticket_closed` | support | `ticketId`, `roomId`, … | support-projector, support-notifier | chat 은 구독하지 않는다 — 방 개설/종료/참가자 변경은 허용 쌍 #1 의 `…InTx`(같은 tx) |
| `deal.published` · `deal.scheduled` · `deal.publish_rejected` · `deal.opened` · `deal.closed` · **`deal.settled`** · `deal.sold_out` · **`deal.stock_adjusted`** · **`deal.restocked`** | deal | `dealId`, `skuId`, `totalQty`, (`delta`), (`restocked: qty·reason`), (`confirmedQty` — settled) | deal-projector, 관리자 알림(`publish_rejected`), **inventory**(약정 증감: published=Earmark, **settled=Release(`Q − confirmed` 만)**, stock_adjusted=조정, restocked=출고 전 취소 복원에 따른 +q) | `deal.scheduled`/`deal.publish_rejected` 는 약정 응답 소비자(`deal-earmark-reactor`)가 `inventory.earmark_changed`/`earmark_rejected` 를 받아 발행(`publish_rejected` 는 `reason` 포함). P3 의 `deal.created` 는 `deal.published` 로 통일. `closed` 는 약정을 풀지 않는다(결제 확정 후 `order.paid` 미소비 주문 보호). `deal.publishing`→`scheduled` 전이는 약정 승인 후 |
| `reservation.created` · `reservation.confirmed` · `reservation.expired` · `reservation.released` | deal | `reservationId`, `dealId`, `qty` | deal-projector, deal-redis-sync, order | |
| `stock.changed` | deal | `dealId`, `remainingApprox` | 실시간 변환기(`deal.state` 휘발성 push, ≤1회/초 합치기) | **프로젝터 파생 신호**(outbox 계약 이벤트 아님 — 위 `reservation.*` 의 파생). 정본 계약 대상 밖이며 영역 문서가 이름만 인용 |
| `order.created` | order | `orderId`, `number`, `totalKrw` | order-projector | |
| **`order.paid`** | order | `orderId`, `orderVersion`, `lines[{lineId,skuId,qty,dealId?}]`, `totalKrw`, **`shippingAddressRef`**, `shippingMethod`, **`fulfillmentMode`**(`demo` 또는 `physical`), `paidAt`, (교환 신규 주문만) **`exchangeOfOrderId`**, **`releaseGate{type:'RETURN_INSPECTED', returnId}`** | **fulfillment**(`physical` 주문만), order-projector, 알림 | **주소 평문 금지**. `shippingAddressRef` = 불투명 참조(`<orderId>:<addressRev>`), 정정 시 rev 증가 |
| **`order.cancel_requested`** | order | `orderId`, `reason`, `requestedBy` | fulfillment | 결제 후 취소 요청. 결과는 `fulfillment.cancelled` / `cancel_rejected` |
| **`order.exchange_completed`** · **`order.exchange_cancelled`** | order | `orderId`, `exchangeId`, `newOrderId`, (취소) `reason` | 알림, order-projector; `exchange_cancelled` 는 **escrow**(`escrow-order-reactor`: 원 에스크로 `frozen→held` 재개)·fulfillment(신규 주문 취소는 `order.cancel_requested` 가 별도로 이끎) | 교환 완료(환불 + 게이트 해제 후) / 취소 (P2 §5.5) |
| `order.demo_delivered` | order | `orderId`, `deliveredAt` | escrow(`escrow-order-reactor`: `shipment.delivered` 와 같게 해제 기한 설정), order-projector | `fulfillment_mode=demo` 주문을 관리자 `MarkDelivered` 로 종결할 때만 발행. 풀필먼트는 소비하지 않는다 |
| `order.cancelled` · `order.expired` · `order.completed` · `order.disputed` | order | `orderId`, `reason` | order-projector, **fulfillment**(`cancelled`·`disputed`: 출고 보류/중지 판단) | 결제 전 취소는 풀필먼트와 무관. 주문 상태에 `fulfilling→cancelled` 전이가 있다 |
| **`order.return_requested`** | order | `orderId`, `returnId`, `lines`, `reason`, **`resolution`**(`REFUND`·`EXCHANGE`), (교환) **`exchangeId`**·**`newOrderId`** | fulfillment(`OpenReturn` 에 교환 연결), **escrow**(자동 해제 기한 동결, `held→frozen`) | (P3 의 `return.requested` 는 이 이름으로 통일). 반품 요청 가능 기한 = 배송 완료 후 5일 < 에스크로 자동 해제 7일 |
| **`order.address_corrected`** | order | `orderId`, `shippingAddressRef`(새 rev) | fulfillment | (P3 의 `address.corrected` 통일) |
| `payment.initiated` · `payment.approved` · `payment.failed` · `payment.unknown` · `payment.refund_pending` · `payment.refund_failed` · `payment.refunded` | payment | `paymentId`, `orderId`, `method`, `amountKrw`, `legs[{asset, amount, krwValue}]`, `snapshotId`(`refund_pending`·`refunded` 는 다리별 환불 `refundLegs[{asset, amount}]` 추가) | order(reactor), payment-projector, (`refunded`: **fulfillment**, escrow) | 포인트 결제도 결제 시작 때 FX 스냅샷을 고정(`snapshotId`). `refund_pending` 은 환불 접수(재시도·수동 처리 큐의 시작점), `refund_failed` 는 영구 실패(수동 처리 큐·경보) |
| `payment.amount_mismatch` | payment | `paymentId`, `expectedKrw`, `observedKrw` | 감사/경보 | |
| `quote.issued` · `quote.used` | payment | `quoteId`, `snapshotId`, `expiresAt` | payment-projector | |
| `escrow.held` · `escrow.disputed` · `escrow.released` · `escrow.refunded` | escrow | `escrowId`, `orderId`, `legs[{asset, amount}]`(escrow 자기 소유 `escrow_leg` 를 읽는다. 단일 `currency` 필드는 두지 않는다) | settlement(reactor), 알림 | 혼합 결제라 에스크로는 다리별 자산을 갖는다. 반품 동결 `held↔frozen` 은 `order.return_requested`·`return.inspected` 구독으로 구동되는 상태 전이다 |
| `settlement.completed` · `settlement.failed` | settlement | `settlementId`, `escrowId`, `usdcNetMicro`, `fundedUsdc`, `fundedPoint`, `r`(플랫폼 부담 = `gross_rem − u_rem`, 항상 ≥ 0), `snapshotId` | 알림 | 정산 입력은 에스크로 잔여 다리(`amount − refunded_amount`) |
| `pricefeed.snapshot_accepted` · `pricefeed.snapshot_held` | pricefeed | `snapshotId`, `pair`, `rateE8` | 경보 | |
| `fulfillment.accepted` | fulfillment | `orderId`, `foId`, `allocation`(`FULL`·`PARTIAL`·`PENDING`), `lines[{lineId, qtyAllocated}]` | order(주문 상태 "출고 준비"; `PENDING` 은 접수 후 할당 대기) | **P3 판본이 정본.** AcceptOrder 단일 tx 에서 접수·할당 시도(`AllocateInTx`)를 마친 뒤 발행한다 — `PENDING` 은 접수는 됐으나 할당이 대기(재입고 시 `inventory.stock_received` 로 재할당). `fulfillment.allocated` 는 이 이벤트에 병합되어 폐기 |
| **`fulfillment.rejected`** | fulfillment | `orderId`, `reason`(`OUT_OF_STOCK`·`ADDRESS_UNSHIPPABLE`) | **order**(주문 `cancelled`), **payment**(`payment-fulfillment-refunder` — 환불 사가 트리거, 멱등 키는 `eventId` 파생) | 상거래가 소비하는 거절 신호는 이것 하나(P2 의 `inventory.allocation_failed` 소비는 폐기) |
| `fulfillment.allocation_completed` · `fulfillment.cancelled` · `fulfillment.cancel_rejected` | fulfillment | `orderId`, `foId`, `lines`/`stage`, `reason` | `allocation_completed`: fulfillment-projector 전용(상거래는 소비하지 않음 — `accepted` 가 이미 출고 준비를 알림); `cancelled`·`cancel_rejected`: order, (`cancelled`: **payment** `payment-fulfillment-refunder`) | `fulfillment.cancelled` → order 가 `order.cancelled`(`fulfilling→cancelled`) + 환불. **`reason=EXTERNAL`(order/payment 가 먼저 시작한 취소의 후속)이면 refunder 는 환불을 다시 시작하지 않는다**(중복 환불 방지, 환불 멱등 키는 `eventId` 파생). `fulfillment.allocated`·`fulfillment.partially_allocated` 는 `accepted` 에 병합되어 폐기 |
| `package.packed` | fulfillment | `foId`, `packageId` | fulfillment-projector | |
| **`shipment.dispatched`** | fulfillment | `orderId`, `foId`, **`shipmentSeq`**, `carrier`, `trackingNo`, `lines` | order(shipped), 알림 | (P2 의 `shipment.created/shipped` 통일) |
| `shipment.status_changed` | fulfillment | `shipmentId`, `status`, `occurredAt` | fulfillment-projector | |
| **`shipment.delivered`** | fulfillment | `orderId`, `deliveredAt`, **`shipmentSeq`**, **`allDelivered`**(모든 배송 완료일 때만 true) | order(`allDelivered=true` 에서만 delivered), **escrow**(`allDelivered=true` 에서만 `release_due_at` = 마지막 배송 완료 + 7일 설정) | |
| **`shipment.delivery_failed`** | fulfillment | `orderId`, `attempts` | order, **escrow**(14일 상한 자동 해제 중지) | (P2 의 `shipment.failed` 통일). 반송(`RETURNED_TO_SENDER`)은 P3 가 ReturnCase/`RETURN_RECEIPT` 흐름으로 입고 |
| **`return.received`** · **`return.inspected`** | fulfillment | `returnId`, `orderId`, (`disposition`: `RESTOCK`·`DISPOSE`·`REFUND_ONLY`·`REJECTED`), **`lines[{lineId, qty}]`**(환불 대상 줄·수량), (교환) **`exchangeId`** | order(환불 판단), **payment**(`payment-fulfillment-refunder`), **escrow**(`REJECTED` 면 `frozen→held`·해제 기한 재설정, 그 외는 환불 경로) | (P2 의 `shipment.returned` 통일). 반품 거절(`REJECTED_RETURN`)도 `return.inspected{disposition:'REJECTED'}` 로 발행하며 환불은 없다. `orderId` 단위 순서 보장을 위해 fulfillment.* 이벤트의 outbox 집합체 키는 `orderId` |
| `inventory.allocation_failed` | inventory | `skuId`, `foLineId`, `qty` | fulfillment (**inventory→fulfillment 내부 신호**, 상거래는 소비하지 않음) | fulfillment 가 `fulfillment.rejected` 로 변환 |
| **`inventory.earmark_changed`** · **`inventory.earmark_rejected`** | inventory | `skuId`, `channelRef`, `qty` | **deal**(`deal_read.sku_capacity` 갱신 / 게시 거절) | **타임딜 총량 ≤ 약정 상한 규칙은 상거래(deal)가 받는다**: 게시 시 로컬 `sku_capacity` 로 1차 검증, 약정(`EarmarkStock`)이 조건부 UPDATE 로 최종 심판. 거절 시 `publishing` 이던 딜은 `draft` 로 복귀(`scheduled` 전이는 약정 승인 후) |
| `inventory.stock_received` · `inventory.low_stock` · `inventory.discrepancy_detected` | inventory | `skuId`, `qty`/`atp`/`kind` | fulfillment(백오더 재할당), 관리자 알림 | |
| `ticket.*` | — | (폐기) | — | `support.ticket_*` 로 통일 |

**폐기·통일된 이름 요약**: `game.created`→`game.started`, `review.requested`/`review.*`→(없음)/`analysis.*`, `game.finished` 의 analysis 직접 소비→`reward.pending_created` 경유, `fulfillment.allocated`→`fulfillment.accepted` 에 병합, `reward.created`→`reward.pending_created`, `ledger.posted`→`ledger.journal_posted`, `deal.created`→`deal.published`, `return.requested`→`order.return_requested`, `address.corrected`→`order.address_corrected`, `shipment.created/shipped`→`shipment.dispatched`, `shipment.failed`→`shipment.delivery_failed`, `shipment.returned`→`return.received`/`return.inspected`, `inventory.allocation_failed`(상거래 소비)→`fulfillment.rejected`, `fulfillment.shipped/delivered/returned`→`shipment.*`/`return.*`, `payment.captured`→`payment.approved`, `chat.reported`→`chat.message_reported`.

## 9. 보안·데이터 보호·감사 확장 (ADR-026/027/028 적용 지침)

### 9.1 새 도메인의 데이터 등급 분류 방법

1. 컬럼마다 등급(PUB·SYS·PSD·PII·HSH·ENC)을 database-schema §9.1 형식으로 적는다(`check:classification` 이 강제).
2. **직접 식별 정보 조합**(이름 + 전화 + 주소)은 개별 PII 가 아니라 한 묶음으로 보고 **ENC**.
3. **자유 텍스트**(문의 본문, 신고 메모)는 기본 ENC 후보 — 공개 채널로 의도된 텍스트(대국 채팅)는 PUB(룸 범위 가시성은 접근 제어).
4. **비밀**(PG 키, 웹훅 서명 키, 지갑 개인키)은 DB 에 저장하지 않고 시크릿 파일. 저장이 불가피하면 ENC.

### 9.2 영역별 후보

| 데이터 | 등급(제안) | 비고 |
|---|---|---|
| 대국 기록(착수, 결과) | PUB | SGF 내보내기 가능 |
| 대국 참가자 id | PSD | |
| 대국 채팅 | PUB (룸 범위) | 신고 메모 ENC |
| 포인트 원장 | SYS (+ 소유자 PSD) | 모의 포인트 |
| 주문 품목·금액 | SYS | |
| **배송지 이름·전화·주소** | **ENC** | 검색 없음(주문 id 로 조회) → 블라인드 인덱스 불필요 |
| 결제 키·토큰(PG 테스트 모드) | 저장 최소화, 참조 id 만 | 카드번호 비저장 |
| 지갑 공개키(devnet) | PSD (공개 정보이나 계정 연결) | 개인키는 비저장 |
| CS 채팅 본문·티켓 | **ENC** | 개인정보 포함 가능 |
| 택배 송장번호 | PII(준) | 수취인과 연결되는 식별자라 평문 로그·지표 금지, 이벤트(`shipment.dispatched`)에는 싣되 보관은 배송 완료 후 정책을 따른다(P3 §보호 등급) |

### 9.3 D13 — KEK/DEK 상향

M1 은 ENC 가 `report.note` 하나(키링 방식). Phase 3 의 `order.order.shipping_address_enc`, Phase 5 의 `payment.payment.provider_payment_key_enc`·`escrow.escrow_dispute.reason_enc`(여기서 4개), 이후 6a 의 CS 본문·6c 의 수취인이 더해져 ENC 필드가 3개 이상이 될 예정이므로 ADR-026 의 재검토 조건("ENC 필드 3개 이상")에 따라 **선제 상향**한다(§9.5 통합표). **Phase 5 착수 직전**(카드 결제 어댑터 구현 전)에 다음으로 올린다.

| 항목 | 설계 |
|---|---|
| KEK | 시크릿 파일의 키링(회전 가능, 키 ID) |
| DEK | 도메인/테이블 단위 데이터 키를 `security.data_key (id, wrapped_key, kek_id, created_at, retired_at)` 에 KEK 로 감싸 저장 |
| 봉투 | `v2.<dekId>.<base64url(iv ‖ ct ‖ tag)>` — v1 호환 읽기 유지 |
| 회전 | KEK 회전은 DEK 재포장만(대량 재암호화 없음), DEK 회전은 신규 쓰기만 새 키 + 배치 재암호화 |
| 마이그레이션 | `guestbook.report.note_enc`·`order.order.shipping_address_enc` v1 → v2 재암호화 잡 |

**상향 작업 항목(Phase 5 착수 전 체크리스트)**: ① `security.data_key` 마이그레이션 ② KEK 키링 시크릿(`KEK_KEYS_FILE`, 기존 `FIELD_KEYS` 대체)과 design/02·10 의 비밀 표·회전 절차 갱신 ③ `FieldCipher` v2 봉투 쓰기 + v1 읽기 호환 ④ `worker rotate-field-keys` 의 KEK 재포장 모드와 DEK 회전 모드 ⑤ v1 필드 일괄 재암호화(위 표) ⑥ 키 백업·복구 런북(design/13)과 키링 분실 시 영향 ⑦ ws-gateway 에 키가 없음을 시험(알림-only 모델 유지) ⑧ 시험: v1→v2 왕복, KEK 회전은 재포장만, DEK 회전 멱등, 덤프에 평문 부재 ⑨ ADR-026 개정(상향 사실 기록).

### 9.4 감사·사고 대응 확장

- 감사 action 추가 후보: `admin.deal_created`, `admin.stock_adjusted`, `admin.refund_issued`, `system.stock_reconciled`, `admin.support_conversation_opened`(CS 상담원이 배송지·문의 열람 — **category 는 `admin`(90일) 유지, `actor_role` 에 `agent`·`operator` 추가**를 M1 변경 요청 #8 에 반영). 열람 감사의 단위는 **GET 마다가 아니라 '대화/주문 열람 세션당 1회'**(알림 때마다 감사 행이 쏠리는 것 방지). 패턴은 M1 `report_note_read` 와 같다(조회도 짧은 쓰기 tx).
- 런북(design/13)에 새 자산 추가 필요: PG 테스트 키, 웹훅 서명 키, 지갑 서명 키(devnet), KEK. 영역 설계가 자산 목록을 올리면 13 에 합친다.

### 9.5 ENC 필드 통합표 (D13)

| # | 필드(컬럼) | 소유 모듈 | 도입 Phase | 등급 | 보관 | 키 회전 대상 |
|---|---|---|---|---|---|---|
| 1 | `guestbook.report.note_enc` | guestbook | M1 | ENC | 글과 함께 보관 | 예 |
| 2 | `order.order.shipping_address_enc` (수령인·전화·주소 JSON 한 덩어리) | order | 3 | ENC | 배송 완료/취소 후 **30일** 뒤 암호문 삭제(익명화; `demo` 주문은 종결(수령 확인/`MarkDelivered`) 후 30일, U4), 주문 자체는 보관 | 예 |
| 3 | `payment.payment.provider_payment_key_enc` | payment | 5 | ENC | 결제 보관 정책(금융 기록) | 예 |
| 4 | `escrow.escrow_dispute.reason_enc` | escrow | 5 | ENC | 분쟁 종결 후 보관(제안 1년) | 예 |
| 5 | `fulfillment.fulfillment_order.recipient_enc` | fulfillment | 6c | ENC | 배송 완료 + 반품 기한 후 **30일** 익명화(§9.6) | 예 |
| 6 | `chat.message.body_enc` + 읽기 사본 `chat_read.message_view.body_enc` (CS 방만) | chat | 6a | ENC | CS **1년**(제안, 법적 의무는 법무 검토 필요·미확인) | 예 |
| 7 | `chat.report.snapshot_enc` (CS 방 신고 스냅샷) | chat | 6a | ENC | 신고 종결 후 90일(제안) | 예 |

**합계: 7개 논리 필드(8개 컬럼 — #6 의 읽기 사본 컬럼 포함)** — 상향 조건(3개 이상) 충족. 구현 순서(D24)로는 Phase 3 에서 2개(#1·#2), **Phase 5 에서 4개(#3·#4 추가)가 되기 전에 KEK/DEK 로 상향**하고(§9.3), 이후 6a 에서 #6·#7, 6c 에서 #5 가 **이미 상향된 v2 체계에 그대로 추가**된다. `rotate-field-keys --field` 는 위 표의 `<스키마>.<테이블>.<컬럼>` 3단 이름을 레지스트리로 갖는다. 읽기 사본(#6)은 투영기가 **암호문 그대로 복사**하며 복호화하지 않는다. ws-gateway 에는 키가 없다(알림-only).

### 9.6 개인정보(PII) 이벤트·사본 지침 (ADR-026 확장)

| 규칙 | 내용 |
|---|---|
| 페이로드 | outbox/inbox `payload`·`request_key.response_body`·로그·지표에 **ENC 대상 값(주소·전화·메모·본문·결제 키)의 평문을 싣지 않는다.** 참조(id, `shippingAddressRef`)와 상태만. outbox 보관(7일) 동안 평문이 DB 에 남는 것을 구조적으로 막기 위함 |
| 주소 정본 | **상거래(`order`)가 보관**(`order.order.shipping_address_enc`, 암호화). 풀필먼트는 `order.paid` 의 `shippingAddressRef` 를 받고 **출고 지시(`AcceptOrder`) 시점에** 상거래의 공개 usecase `order.GetShippingAddress(ref)`(감사 `system.shipping_address_read`)로 읽어 **자기 키로 다시 암호화한 사본**(`recipient_enc`)을 둔다 |
| 사본 수명 | 풀필먼트 사본은 배송 완료 + 반품 기한 경과 후 **30일**에 익명화(암호문 삭제, 제안). 상거래 원본도 배송 완료/취소 후 30일에 삭제(제안; `demo` 주문은 종결(수령 확인/`MarkDelivered`) 후 N일 — 기본 30일, U4). 정정(`order.address_corrected`)이 오면 새 `rev` 로 재스냅샷 |
| 열람 감사 | 주소·CS 본문·신고 메모를 사람이 열람하면 감사 기록(`admin.support_conversation_opened` 등 `actor_role=agent`, 열람 세션당 1회, 조회도 짧은 쓰기 tx) |
| 이벤트 검사 | 스키마 시험이 `payload` 허용 필드 목록(additionalProperties:false)을 강제하고, 08 시험이 센티널 PII 가 outbox/inbox/로그/덤프에 없음을 확인 |

## 10. 운영 확장 (D17)

### 10.1 Phase 4 워크로드 분리

| 워크로드 | 스케일 | probe | PDB(제안) | 종료 |
|---|---|---|---|---|
| `api` | 무상태, HPA(CPU 60%, 최소 2) | readyz | minAvailable 1 | 진행 요청 완료 후 |
| `ws-gateway` (Phase 4 시점) | 연결 수 기준 수동/HPA(사용자 지정 지표는 미확인) | readyz | minAvailable 1 | readyz 503 → `bye`/1001 → preStop 5초 (M1 G8: 새 연결 실패 0/1156 vs preStop 없음 26/837) |
| `ws-gateway room` (6a 이후 재평가) | 위와 같음 | readyz | minAvailable 1 | 같음 + 룸 재구독은 `resume`. Phase 4 에는 룸 연결이 없다. **`/ws/room` 이 도입되는 6a 이후**에 사이트용/룸용 분화 필요성을 측정으로 판단한다(D17) |
| `worker` | 디스패처 리더 1(어드바이저리 락), 러너는 늘릴 수 있음 | healthz | — | 임대 반납 |
| `analysis-worker` (Phase 2 에 합류) | 큐 길이·CPU 기준, 동시성 **1**(ADR-033, 늘리려면 CPU 예산 재산정) | healthz | — | 진행 분석 취소(토큰 미완료 → 임대 만료 후 재선점) |
| `web` | 동적 렌더(CSP nonce, G3) 라 CPU 기준 | readyz | minAvailable 1 | SIGTERM 143 |

- k3d 검증(G8)과 live Compose 는 **같은 이미지**(ADR-002). HPA·PDB 는 k3d 에서만 검증된다.
- 롤링 중 소켓 재접속은 M1 실측 결과를 그대로 쓴다(우아한 종료 + preStop 조합 필수).

### 10.2 관측·경보

- 지표 네임스페이스 `pf_<도메인>_…`. 영역 설계가 도메인 지표를 정의하고 F17 카탈로그에 합친다. **종류 규약은 F17 과 같다**: 카운터만 `_total`, 게이지는 접미 없음(예: `pf_ledger_imbalance`). 원장 지표는 두 개다: `pf_ledger_imbalance`(분개 단위 불균형 게이지, 정상 0)와 `pf_ledger_trial_balance_nonzero`(대사: 자산별 시산표 합이 0 이 아닌 자산 수 게이지). `pf_ledger_unbalanced_journals` 는 쓰지 않는다. 새 지표를 만들기 전에 M1 지표에 `channel`/`mode` 레이블을 확장해 흡수할 수 있는지 먼저 본다 — 룸 연결 수는 `pf_ws_connections{channel="room"}`, 재개는 `pf_ws_resume_total{mode}` 로 흡수(별도 `pf_room_connections`·`pf_game_resync_total` 를 만들지 않는다). 영역 신규 카운터: 채팅 금칙어 마스킹 `pf_chat_masked_total{room_kind}`(P4), 바둑 `pf_game_undo_total{outcome}`·`pf_game_finished_total{rules}`(P1 §11).
- 영역별 필수 경보 후보: 대국 중단 비율, 분석 큐 적체/실패, 재고 불일치(Redis vs Postgres), 결제 웹훅 실패/지연, 풀필먼트 SLA 초과, CS 응답 지연, `TransportLoss`.
- 공개 대시보드(Grafana Public dashboards)에는 **도메인 요약 지표만** 노출한다(주문·결제의 개별 값 금지).

## 11. 자원 예산 (ADR-033)

### 11.1 컨테이너별 메모리 (유휴 측정 / 추정)

| 컨테이너 | 값 | 근거 |
|---|---|---|
| nginx proxy | 7.5MiB | 유휴 측정 |
| web (Next, Bun) | 약 164MiB | M1 G3 측정(컨테이너 실행 직후) |
| api (Bun) | 약 60–90MiB | 추정(M1 Bun 서버 36–90MB 측정 범위 기반) |
| ws-gateway (Bun) | 36–90MiB | M1 측정(기준 36MB, 10k 연결 89MB) |
| worker (Bun) | 약 60MiB | 추정 |
| postgres | 유휴 56MiB → 운영 200–400MiB | 유휴 측정 + 추정(shared_buffers·커넥션) |
| prometheus | 유휴 46MiB → 150–300MiB | 유휴 측정 + 추정(시계열 증가) |
| **grafana** | **유휴 440MiB** | 유휴 측정(13.x 는 무겁다) |
| tailscaled (호스트 프로세스, Funnel) | 미측정 — 교체 전 cloudflared 추정 30MiB 를 합계에 자리표시로 남김 | 교체 후 측정 필요 |
| redis | 유휴 6.8MiB → ≤ 256MiB(maxmemory) | 유휴 측정 + 설정 상한(제안) |
| envoy gateway (k3d 검증 시) | 컨트롤 40–84MiB + 프록시 17–54MiB | M1 G8 측정 |
| k3d 노드 | 약 1.25GiB | M1 G8 측정(검증 때만, 라이브와 동시 상주 아님) |
| analysis-worker (KataGo) | **미확인** — 모델·스레드에 따라 약 0.5–3GiB(추정 범위). 컨테이너 한도는 P1 의 2GiB(제안)가 아니라 **S0 스파이크(실측) 후** 정한다(범위 상단 3GiB 와 어긋남) | P1 이 모델 선정 후 측정 |

### 11.2 Phase 별 합산 (라이브 Compose, 상시) — 구현 순서 누적

| 순서 | 구성 | 합(추정) | 16GB 호스트 대비 | 24GB 호스트 대비 (참고용, Oracle 미추진) | 12GB(2 OCPU) 호스트 대비 (참고용, Oracle 미추진) |
|---|---|---|---|---|---|
| 1 | M1 (§11.1 구성요소 하한/상한 합: nginx 7.5 + web 164 + api 60–90 + ws 36–90 + worker 60 + postgres 200–400 + prometheus 150–300 + grafana 440 + cloudflared 30 MiB = 1,148–1,582 MiB) | 1,148–1,582 MiB (약 1.12–1.54GiB) | 약 7–10% | 약 5–6% | 약 9.3–12.9% |
| 2 | + Phase 3 (+ redis, 상한 256MiB 로 계산, 모듈 +30–50MiB; 최소 pricefeed·escrow 포함) | 1,434–1,888 MiB (약 1.40–1.84GiB) | 약 9–12% | 약 6–8% | 약 11.7–15.4% |
| 3 | + Phase 4 (레플리카: api×2, ws×2 → +200–300MiB) | 1,634–2,188 MiB (약 1.60–2.14GiB) | 약 10–13% | 약 7–9% | 약 13.3–17.8% |
| 4 | + Phase 5 (추가 컨테이너 없음, 모듈 +30–50MiB) | 1,664–2,238 MiB (약 1.62–2.19GiB) | 약 10–14% | 약 7–9% | 약 13.5–18.2% |
| 5 | + 6a~6d (추가 컨테이너 없음, 모듈 +50–100MiB, 룸 연결 최대 +20MiB) | 1,714–2,358 MiB (약 1.67–2.30GiB) | 약 10–14% | 약 7–10% | 약 13.9–19.2% |
| 6 | + Phase 1 (추가 컨테이너 없음, 대국 모듈 +20MiB) | 1,734–2,378 MiB (약 1.69–2.32GiB) | 약 11–15% | 약 7–10% | 약 14.1–19.4% |
| 7 | + Phase 2 (+ analysis-worker 1.5GiB 가정) | 3,270–3,914 MiB (약 3.19–3.82GiB) | 약 20–24% | 약 13–16% | 약 26.6–31.9% |
| 8 | + 6e (추가 컨테이너 없음, +10MiB) | 3,280–3,924 MiB (약 3.20–3.83GiB) | 약 20–24% | 약 13–16% | 약 26.7–31.9% |

- **도착점(최종 상태)은 구현 순서와 무관**하게 약 3.2–3.8GiB(추정)다. 순서가 바뀌면 **중간 값만** 달라진다 — 이력서 제출 가능 시점(M1+Phase 3+4)에는 약 1.6–2.1GiB 로, KataGo(1.5GiB 가정)가 합류하기 전이라 **중간 자원 부담이 가장 낮다**. 구성요소를 직접 더해 다시 계산했다(이전 표의 최종 3.1–3.7GiB 와의 차이는 모듈 증가분 추정치 반올림이다).
- **D14 규칙**: 상시 합 ≤ 호스트 RAM 의 60%(16GB 면 9.6GiB, 12GB 면 7.2GiB). 최종 3,280–3,924MiB 는 12GB 기준 26.7–31.9% 라 메모리 60% 규칙을 통과한다. 위 추정은 여유가 크다. 가장 큰 불확실성은 **KataGo 와 Grafana(440MiB)** 다.
- 집 PC 의 WSL2 는 메모리 상한이 별도로 있을 수 있다(미확인). Oracle(12GB·24GB 열)은 신용카드가 없어 추진하지 않는다(2026-11-05) — 해당 열은 참고용이다.
- **CPU 예산이 메모리보다 먼저 걸린다**: 이 개발 머신은 6코어. KataGo 는 CPU 바운드이므로 `analysis-worker` 는 스레드 수·동시성 1·낮은 우선순위(`nice`)·방문 수 상한을 두고, 라이브 사이트(api·ws)의 코어를 침범하지 않게 `cpuset`/limits 로 분리한다(제안). 분석 큐 적체는 허용하되 대국 서비스 지연은 허용하지 않는다. **12GB(2 OCPU) 호스트에서는 이 문제가 더 크다**: D14 의 CPU 분리로 KataGo 에 코어 하나를 주면 사이트용(api·ws·web·worker·postgres)에 코어가 거의 남지 않을 수 있어, 메모리 60% 규칙은 통과해도 **CPU 예산이 먼저 걸린다**(스레드 수·오프피크 한정은 Phase 2 설계 재검토 §12.5 에서 다시 정한다).
- Prometheus 시계열 증가를 막기 위해 레이블 허용목록(식별자 금지)을 도메인 지표에도 적용한다.

### 11.3 배포 단위 (Phase 4)

M1 의 "같은 이미지 · 다른 시작 명령" 원칙을 유지한다: `server` 이미지 1개(api·ws-gateway(site|room)·worker 의 시작 명령 분화), `web` 이미지 1개, **분석 워커는 별도 이미지 `pf-analysis`**(KataGo 바이너리·모델 레이어 포함, 같은 모노레포 코드). GHCR 태그 규약(09)은 이미지 이름 하나 추가(`pf-analysis`)만 필요하다.

## 12. 위험·순서 재검토·DoD 정합

### 12.1 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| KataGo 가 라이브 호스트 CPU 를 점유 | 대국·사이트 지연 | CPU 예산(D14), 낮은 우선순위, 큐 적체 허용, 분석은 오프피크 |
| (참고용, Oracle 미추진) 2 OCPU(12GB) 호스트에서 KataGo 의 CPU 분리가 사이트 코어를 거의 남기지 않음 | 사이트 전체 지연 | 메모리 60% 규칙은 통과하나 CPU 예산이 먼저 걸린다 — 동시성 1·`nice`·방문 수 상한·오프피크, Phase 2 설계 재검토에서 스레드 수 재산정(§11.2) |
| Redis 장애 영역 공유(재고+Streams) | 초과 판매 방어/전달 동시 영향 | D7(재구성), 재고 거부 우선, 분리 트리거(§5.2) |
| 모의 금전의 오해 | 법·신뢰 문제 | D18 표시, README 면책(ADR-015) |
| 스코프 팽창(Phase 5·6) | 일정 | 항목별 독립 DoD, 중단 가능(ADR-016) |
| 룸 이벤트 지연 | 체감 품질 | D10 예산 측정 → fast lane |
| 🔴 **집 PC 중단·정전·회선 단절 = 사이트 전체 중단(단일 장애점)** | 전 기능 중단(소개·방명록·실시간·후속 Phase 전부) | 별도 주소 정적 대체 페이지(FR-122, [design/16](../16-outage-fallback-page.md), 수동 전환), 무정전 재시작 절차(systemd `enable`·compose `restart: unless-stopped`), 외부 가용성 점검 — 같은 PC 의 Grafana 는 PC 가 죽으면 같이 죽으므로 무료 외부 업타임 점검 서비스가 후보(**서비스·무료 조건 검증 필요**). **수용**: 사용자가 단일 호스트를 수용(spec A-033) |
| 🔴 **Funnel 대역폭 한도(비공개, 설정 불가)** | 응답 지연·끊김, 후속 Phase 의 트래픽이 늘수록 악화 | 관문 G14 ③ 체감 측정, 자산·페이로드 축소(ADR-003). 수치를 만들지 않는다 |
| 🔴 **Funnel 베타 정책 변경** | 노출 경로 상실 | 재검토 조건(ADR-003), 도메인 확보 시 다른 경로(Cloudflare Tunnel 등) 복귀 |
| 🔴 **클라이언트 IP 미확인으로 IP 기반 속도 제한 약화** | `limit_req` 주소별 제한이 전역 한도화, `/api/me` 세션 발급 남용 방어 약화 | 세션/계정 기준 제한 우선(ADR-008), 관문 G14 ④ 실측, 후속 Phase 의 남용 방어(결제·채팅)도 세션/계정 기준으로 설계 |
| 🔴 **자동 절체 없음(수동 전환)** | 중단 중 앱 주소 접속자는 연결 오류 | README·프로필에 앱·대체 페이지 두 주소 병기, 업타임 알림, 런북(design/16 §4.1). 수용 |
| 설계 대 구현 괴리 | 문서 낡음 | 단계 착수 전 ADR Accepted, 단계 종료 시 문서 동기, **착수 전 설계 재검토(§12.5)** |
| 바둑 계열(Phase 1·2)을 마지막에 구현해 위험(KataGo 실행 가능성·룰 엔진·3D)이 늦게 드러남 | 마지막 단계에서 설계 수정 | KataGo 스파이크를 Phase 1 착수 전에 앞당기고(G14), 룰 엔진 시험 세트·차분 퍼징은 Phase 1 첫 작업으로, 늦게 드러나는 실패는 모의 분석기·2D 클라이언트 폴백으로 DoD 를 지킨다 |
| 앞 Phase 가 바둑 없이 쓰는 임시 경로(데모 지급, 약정 off, 고정 환율, 최소 escrow, `demo` 주문 종결 경로)가 영구화 | 두 경로 유지 비용 | 임시 경로마다 종료 조건을 명시(§1.4 G1~G6), 해당 Phase 의 설계 재검토에서 점검 |

### 12.2 순서 재검토 (D24 반영)

- **구현 순서**: M1 → 3 → 4 → 5 → 6a → 6b → 6c → 6d → 1 → 2 → 6e. 로드맵 번호는 유지한다(§1.4 의 선행 의존·공백·해법).
- **6a~6d 의 내부 순서**(CS 채팅 → Passkey → WMS → Solana)는 유지하되 의존을 확인한다: CS 채팅은 `order`(Phase 3)가 선행(배송 정보는 6c 이후 채워짐, G10), **WMS 는 주문·재고·결제(Phase 3·5) 선행**이라 5 이후가 맞고, Solana 에스크로는 payment/settlement 선행이다.
- **6d 진행·6e 보류(U13 확정 2026-11-05)**: Solana devnet 에스크로(6d)는 진행하고 마작(6e)은 보류하며 경계(`RuleEngine` 포트)만 유지한다.
- **마작(6e)은 Phase 1 의 게임 프레임이 `GameRules` 플러그인 구조일 때만 저비용**이다 → P1 에 "규칙 엔진 포트"(`RuleEngine`)를 두어 마작이 그 위에 올라가게 한다.
- **Redis 는 Phase 2 가 아니라 Phase 3 에** 도입한다(D6). 구현 순서가 바뀌어도 Phase 3 이 먼저이므로 변함없고, Phase 2 의 분석 큐는 DB 선점이다(D23).
- **`ledger` 는 Phase 3 에서 도입**한다(G1). 바둑 보상(Phase 2)은 도입된 원장 위의 마지막 포인트 출처다. 최소 `pricefeed`·`payment`·`escrow`·환불도 Phase 3 이다(G2~G4).
- **`chat` 코어·`/ws/room` 은 6a 에서 도입**한다(G9). 대국 채팅은 Phase 1 에서 방 종류만 추가한다.

### 12.3 Phase 별 DoD 와 아키텍처 선행조건 (구현 순서)

| 순서 | Phase | README DoD | 선행 아키텍처 조건 | 검증 후보 |
|---|---|---|---|---|
| 2 | 3 | 초과 판매 0 + k6 결과 + 혼합 결제·환불 시연(첫 로그인 지급 → 구매 → 환불) | Redis 도입(단일 인스턴스), `StockReservation`, reconcile 잡, (Streams 판정), `ledger`(POINT·USDC)·지급·교환, 최소 `pricefeed`(고정 환율)·`payment`(원장 결제)·`escrow`(hold·release·refund)·환불, B12 틀·쌍 #2~#5·#7·#8 | 동시 예약 시험, Redis 유실 시험, 구매 확정·환불 원자성 계약 시험, 원장 속성 시험(자산별 차변=대변) |
| 3 | 4 | README+영상만으로 이해 가능 | 워크로드 분리, HPA/PDB, 롤링 소켓 재접속 | k3d 롤링 시험, 관측 대시보드 |
| 4 | 5 | 카드 결제→분쟁·반품 동결→정산 재현, 환율 고정 기록 | PG 어댑터, 웹훅 inbox, KEK/DEK, 실제 시세 소스·교차 검증기 추가(G3), `escrow` 확장(분쟁·동결·자동 확정 타이머), `settlement` | 웹훅 중복/역순, 견적 만료, 부분 환불 후 정산 속성 시험 |
| 5 | 6 (6a~6d) | 항목별 독립(6a: 고객 티켓→상담원 선점→해결, 본문 평문 없음, 롤링 중 룸 재구독 시험 등) | 6a: `chat` 코어·`/ws/room`·룸 포트·`agent`(선행: Phase 5 의 KEK/DEK v2), 6c: `operator`(선행: 6a 의 `RolePolicy`)·약정 활성화·물리 재고 시드 | 항목별 |
| 6 | 1 | 두 브라우저 3D 대국, 복구, 관전 동기화 (+ **대국 채팅: 복구·중복 방지·관전자 비공개, 롤링 중 룸 재구독** — 6a 는 CS 룸(본문 없는 알림 push + REST)만 실행했으므로 평문 본문 push·관전자 비공개·`ChatRoomPolicy` 는 여기서 처음 실행된다) | `/ws/room` 에 `game:*` 추가, 룸 로그/스냅샷, 룰 엔진 선정, `GameRoomPolicy`, 대국 룸 종류 | 룸 재접속 시험, 룰 시험 세트, 채팅 재개·중복 시험(대국 룸 종류) |
| 7 | 2 | 종료 → 분석 → 보상 확정 end-to-end | `analysis` 선점/토큰, `ledger` 보상 상태 머신(원장은 Phase 3 에 있음) | 분석 중 워커 kill → 재선점, 보상 상태 전이 |
| 8 | 6e | 항목별 독립 | `GameRules` 플러그인 | 규칙 시험 세트 |

### 12.4 통합 M1 변경 요청 표 (영역 설계 P0~P4 → M1 정본 문서)

영역 설계가 요구한 M1 문서·ADR 변경을 중복 제거해 모았다. **M1 문서는 이 작업에서 수정하지 않았고**, 해당 Phase 착수 직전에 아래 순서로 반영한다.

| # | 대상 | 요청 내용 | 출처 | 시점 |
|---|---|---|---|---|
| 1 | design/04, ADR-018 | 세 번째 연결 `/ws/room`, 봉투 `ch:'room'`·`rm`, 인바운드 허용 목록(`hello`·`room.join`·`room.leave`·`ping`·`typing`), 휘발성 `room.presence`·`room.typing`, "WS 는 읽기 전용" 원칙에 룸 구독 제어 예외 명시 | P0·P1·P4 | 6a (`/ws/room` 첫 사용) |
| 2 | F14 | `PublicHub` → 방별 `RoomHub` 일반화(포트 `RoomAccessPolicy`·`RoomSnapshotProvider`·`RoomMessageMapper`·`RoomEventSource`), `SendQueue`·4408·`bye` 재사용, NOTIFY `room_changed` 구독, presence 소유(§6.9) | P0·P1·P4 | 6a |
| 3 | design/03 §1.1 | 속도 제한 등급 추가: `write.game`, 채팅 7종(P4 §6.1), `write.purchase`·`write.checkout`·`write.refund`·`write.exchange`(USDC→POINT 교환), **`write.return`**(반품·교환 요청, 세션당 10회/분 제안, P2 §5.5), 웹훅 | P1·P2·P4 | Phase 3·6a·1 |
| 4 | design/03, 00 §4.3, F16 | 오류 wire code 추가(`illegal_move`·`not_your_turn`·`game_over`·…, CAS 경합 패배는 M1 `version_conflict` 재사용(`stale` 신규 코드 폐기), 결제·재고 코드 P2 §13.4, 채팅 코드), 접두사 없음 규칙 유지 | P1·P2·P4 | Phase 3·6a·1 |
| 5 | design/01 B12, F16 §8.2, ADR-019 | 경계 규칙 **B12**(§2.4: 층 규칙 + `*InTx` 허용 쌍, `layers.json`·`tx-pairs.json`, `check:arch` 규칙 (a)~(d)), `TxContext` 를 받는 `InTx` 공개 함수 개념과 "중첩 `uow.run` 금지는 유지" 문구 | P0·P2·P4 | Phase 3(틀·쌍 #2~#5·#7·#8), 이후 쌍 추가 시 |
| 6 | F16 가드 | `RequireRole(agent\|operator\|admin)`, `RequireParticipant`, `WebhookGuard`, `StepUpGuard`(6b, Passkey) | P1·P2·P3·P4 | Phase 3·5·6a·6b·1 |
| 7 | F10(ID-09), design/01 env | `AdminPolicy` 일반화 → `RolePolicy`: `AGENT_GITHUB_IDS`·`OPERATOR_GITHUB_IDS`·`ADMIN_GITHUB_IDS`, `ActorContext.roles` | P0·P3·P4 | 6a(agent)·6c(operator) |
| 8 | ADR-027, database-schema 감사 | 감사 `actor_role` 에 `agent`·`operator` 추가(category 는 `admin`/`system`/`auth` 유지 — 새 category 없음), action 추가(`admin.reward_*`, `system.ledger_audit_ran`, `admin.deal_created`, `admin.stock_adjusted`, `admin.refund_issued`, `system.stock_reconciled`, `system.shipping_address_read`, `admin.support_conversation_opened`(actor_role=agent), `system.welcome_grant_claimed`, `admin.grant`, `system.points_exchanged`, 창고 action 등). 열람 감사 단위는 열람 세션당 1회 | P1~P4 | 각 Phase |
| 9 | database-schema §9 | "이벤트 없는 읽기 모델 삭제 예외"에 채팅 보관 정리·`hold` 규칙 추가, `RetentionRule` 등록 목록(채팅, `carrier_event` 90일, `pick_scan` 90일, 수취인·배송지 익명화 30일, `reservation` 30일, `payment_event` 90일 등) | P2·P3·P4 | 각 Phase |
| 10 | database-schema §9.1, ADR-026, `rotate-field-keys` | 컬럼 등급 등록, ENC 통합표(§9.5) 필드를 회전 대상에 등록, KEK/DEK 상향(§9.3) | 전부 | Phase 3~5 |
| 11 | design/01 env, design/02 | `AGENT_/OPERATOR_GITHUB_IDS`, `CHAT_*` 한도, **단일 Redis 접속 `REDIS_URL`**(키 접두사로 용도 분리, D6; `REDIS_STOCK_URL`/`REDIS_STREAM_URL` 분리는 Phase 4 재평가 후), PG·웹훅 서명 시크릿, `KEK_KEYS_FILE` | P2·P3·P4 | Phase 3~6 |
| 12 | F17 nginx | `pf_purchase`·`pf_webhook`·`/ws/room` 연결 zone, 웹훅 경로 분리, 결제 라우트 분리 | P2·P3 | Phase 3·5 |
| 13 | design/02 compose | **단일 `redis` 컨테이너**(`maxmemory 256mb`, `noeviction`, AOF everysec, 비스트림 키 전부 TTL — D6; `redis-stock`/`redis-stream` 분리는 Phase 4 재평가), `analysis-worker`(KataGo, 별도 이미지 `pf-analysis`) 컨테이너 | P1·P2 | Phase 3·2 |
| 14 | F17 지표·경보 | 영역별 `pf_*` 지표와 경보(P1 §16.1, P2 §18, P3 §15, P4) | P1~P4 | 각 Phase |
| 15 | design/10 CSP, design/12 콘텐츠 | PG 도메인·결제 라우트 CSP, three.js 에셋, 모의 면책 변수·약관/환불 문구, 개인정보 안내 확장(채팅·배송지) | P1·P2 | Phase 3·1 |
| 16 | design/13 런북 | 새 자산: PG 키·웹훅 서명 키·devnet 키·KEK·모델 파일 | P0 | Phase 5 |
| 17 | tech-stack | three.js/R3F, KataGo, `@sabaki/sgf`, Redis/Valkey 이미지 고정(Phase 3 시작) | P0·P1 | 각 Phase |
| 18 | ADR-023 | 분석 워커는 **ADR-021 의 토큰 조건 임대 연장(heartbeat)을 적용**한다(ADR-023 의 "임대 연장 없음"은 M1 짧은 핸들러 기준 문구이므로 "오래 걸리는 분석 워커는 ADR-021 연장 사용" 한 줄 보강). 연장 간격 = 임대/3, ADR-023 의 `임대 ≥ p99×10` 규칙은 **연장 간격**에 적용(총 작업 시간이 아님) | P1 | Phase 2 |
| 19 | ADR-024 | 이미 있는 포트 `StockReservation` 의 연산 구체화(`reserve`·`release`·`confirm`·`restock`·`peek`)와 도입 시점(Phase 3), 단일 인스턴스 규칙 참조 | P0 | Phase 3 |
| 20 | ADR-006 | 확정 시 `Superseded by ADR-031` | P0 | Phase 3 판정 후 |
| 21 | architecture §12, database-schema §11, README | Phase 표·모듈 지도·스키마 윤곽을 본 문서로 동기(이번 작업에서 포인터만 반영) | 전부 | 각 Phase |
| 22 | F00 | 기능 접두사 BD·LG·AN·CT·OD·PY·ES·ST·WM·CH·SP 등록 | 전부 | 각 Phase |
| 23 | design/11 | Phase 1 이후 작업 분할은 영역 설계 확정 후 별도 문서 | P0 | 각 Phase 착수 전 설계 재검토(§12.5) |
| 24 | database-schema §1·§9 (CQRS 예외 목록) | **예외 X1 등재**(P0 §2.4 표): `game_event` 는 방 로그이므로 ws-gateway 의 `RoomEventSource.after`, query usecase `SyncGame`, `GET /api/games/{id}/events` 가 쓰기 스키마 `game_event` 를 읽는다(스냅샷의 쓰기 모델 읽기와 함께 문서화된 예외). ADR-018 5번 규칙에도 한 줄 | P1 | Phase 1 |
| 25 | ADR-009 | `game.review.requested`·"분석 요청과 보상 생성은 같은 트랜잭션"을 **개정(Superseded 부분)** — 보상 생성은 `ledger` 가 `game.finished` 소비, 분석 작업은 `reward.pending_created` 소비(P0 §8.3) | P1 | Phase 2 |
| 26 | F14, design/04 | 룸 구독 속도 한도 정본(초당 5회, `4429`)을 M1 04 §1 의 클라이언트 메시지 한도(초당 10건)와 구분해 서술, `RoomAccessPolicy` 소유는 realtime | P0·P1·P4 | 6a |
| 27 | design/03 §1.1·§4 | 대국 명령 REST 계약 일체(`POST /api/games/{id}/moves`·`passes`·`resign`·`dead-stones`·`score-confirmations`·`resume-requests`·`resume-accept`·`heartbeat`)와 오류 코드 `game_over`·`resume_limit`·`no_pending_request`·`illegal_move`·`not_your_turn`(CAS 경합 패배는 `version_conflict` 재사용) | P1 | Phase 1 |
| 28 | database-schema §1·§9 (CQRS 예외 목록) | **예외 X2 등재**(P0 §2.4 표): ws-gateway 의 `RoomSnapshotProvider`/`RoomEventSource` 구현(chat)이 읽기 모델 지연에 대비해 쓰기 모델 `chat.room.last_seq` 로 `head` 를 읽는다(구독 먼저 등록 → head → 읽기 모델 대기·재시도, 04 §4) | P4 | 6a |
| 29 | F10(ID-10), database-schema §9·§9.1 | `AnonymizeSessionData` 등록 대상에 `game.game_player`, `chat.participant`·`message.sender_key`·`report.reporter_key` 의 세션 행위자 키 추가 | P1·P4 | 6a(chat)·1(game) |
| 30 | M1 로그인 직후 훅(웹앱) | 로그인 성공 뒤 웹앱이 `POST /api/ledger/welcome-grant` 를 **1회 자동 호출**(M1 코드 변경 없음, Phase 3 웹앱 쪽 변경) — M1 명세는 건드리지 않는다 | P2 | Phase 3 |
| 31 | database-schema §9·§9.1, F10 | 지갑 공개키·챌린지가 PSD 로 분류되고 `AnonymizeSessionData`/계정 삭제 대상에 `identity.wallet_link` 가 포함된다(6d) | P2 | 6d |

### 12.5 운영 규칙 — Phase 착수 전 "설계 재검토" (동결이 아니라 갱신 절차)

모든 영역의 설계를 끝까지 완성해 두되, **설계는 구현으로 증명되기 전까지 가설**이다. 그래서 각 Phase 착수 전에 아래 단계를 거친다.

1. **앞 Phase 에서 배운 것 반영**: 실측값(지연·자원·처리량), 바뀐 가정, 실패한 가설을 해당 Phase 설계와 ADR 에 반영한다. 번호·구조는 유지하고 서술과 수치를 갱신한다.
2. **독립 검토**: 해당 Phase 설계에 대해 앞선 구현과의 정합을 독립 검토자(결론을 주지 않은 상태)로 한 번 점검하고, 확인된 모순만 고친다.
3. **ADR 확정**: ADR-030~048 은 2026-11-05 U1 로 일괄 Accepted 가 되었다. 이후 변경은 개정 ADR 로 한다.
4. **스파이크**: 설계가 의존하는 미확인(외부 서비스, 성능, 실행 가능성)을 구현 전에 측정한다(예: PG 가입 조건·웹훅 서명, KataGo 성능, Passkey 라이브러리).
5. **작업 분할**: `design/11` 형식으로 해당 Phase 의 작업을 쪼갠다(§13).
6. 완료 후 **문서 동기**: 구현에서 달라진 점을 이 문서·영역 설계·README 에 반영한다.

## 13. 문서·ADR 갱신 계획

이 문서가 확정되면 다음을 갱신한다(이번 작업에서는 수정하지 않았다).

| 대상 | 내용 |
|---|---|
| `docs/adr/README.md` | ADR-030~033 색인 추가(현재 Accepted) |
| ADR-006 | 확정 시 `Superseded by ADR-031` 표시 |
| ADR-024 | 기존 포트 `StockReservation` 의 연산(`restock` 포함)과 도입 시점(Phase 3)·단일 인스턴스 규칙 참조 |
| `database-schema.md §11` | 이 문서·영역 설계의 스키마 윤곽으로 교체, `realtime_read.room_log`·`room_seq`(예약, 현재 미사용), `security.data_key` 추가 |
| `architecture.md §12` | Phase 표를 §1.1 로 교체, 모듈 지도에 L 층 규칙 |
| `README.md` 로드맵 | **구현 순서 열**, 이력서 제출 가능 시점(M1+Phase 3+4), 설계 재검토 운영 규칙 (반영됨) |
| `design/01` 경계 규칙 | B12 층 규칙, 룸 fast lane 예외 |
| `design/04` | `/ws/room` 절, 봉투 `rm` 필드 |
| `design/11` | Phase 별 작업 분할은 **각 Phase 착수 전 설계 재검토(§12.5) 때 별도 문서**로 |
| `design/13` | 새 자산(PG 키, 서명 키, KEK) 런북 추가 |
| `tech-stack.md` | Redis/Valkey 결정 시점, KataGo, three.js 항목 |

## 14. 영역별 접점 요청 (P1~P4 가 이 문서에 기대는 것·이 문서가 기대하는 것)

| 영역 | 이 문서가 영역에 요구하는 것 | 영역이 이 문서에 기대하는 것 |
|---|---|---|
| **P1 바둑** | `RuleEngine` 포트 + 서버 권위 + 공통 시험 세트, `GameRules` 플러그인 경계(마작), `RoomAccessPolicy/SnapshotProvider/MessageMapper` 구현, `game.started`·`game.finished` 이벤트 정의(§8.3), `analysis` 모듈(분석 작업을 ledger 의 `reward.pending_created` 로 생성), `ledger` 는 §2.5 단일 원장, 룸 이벤트 지연 측정 | D8 push 전용, D3 ws 배치, D10 지연 예산, D14 CPU 예산, 룸 프로토콜(§6.3) |
| **P2 상거래** | `StockReservation` 계약과 reconcile 절차, 예약→확정 사가, 웹훅 inbox 멱등, 금액 규약, 모의 표시(D18), Streams 판정용 부하 시나리오 | D4~D7 Redis/Streams, D13 KEK/DEK, 크로스 도메인 이벤트 지도 |
| **P3 풀필먼트** | `order.paid` 소비, 재고 이중 원장(상거래 재고 vs 물리 재고) 정의, `CarrierAdapter`, 배송지 ENC·열람 감사 | 크로스 이벤트 지도, 역할 `admin`/`agent`, D13 |
| **P4 채팅** | `chat` 룸 수명(대국 연동), `RoomAccessPolicy` 구현, 신고→관리자 큐, 보관 정책(대국/CS), CS 룸 `cs:` 와 `agent` 역할 | D8·§6 룸 모델, 접근 판정 포트, 보관·ENC 기준(§9) |

## 15. 미결

| 항목 | 결정 시점 |
|---|---|
| Redis vs Valkey 이미지 고정 | Phase 3 시작 |
| Streams 채택 여부(D4) | Phase 3 부하 시험 후 |
| 룸 이벤트 지연 실측(채팅 룸 1차, 대국 룸 확정)과 fast lane 필요 여부(D10) | 6a(1차) · Phase 1 부하 시험(확정) |
| KataGo 모델·스레드·메모리 | P1 설계 + 측정 |
| HPA 사용자 지정 지표(연결 수) 방식 | Phase 4 |
| Passkey 복구·분실 정책 | Phase 6b 착수 시 ADR |
| 집 PC 의 WSL2 메모리 상한(Oracle 은 미추진) | 호스팅 실측 시 |
| seller 포털 필요 여부 | Phase 6 이후 |
| `escrow`·`inventory` 모듈의 층 배치 확정(L5/L4) | 구현 착수 시(§2.1 은 제안) |
| 승격 가능한 허용 쌍 추가(B12 #11…) | ADR-030 개정 |
| 첫 로그인 지급 금액·총 발행 상한·재충전·교환 한도·지갑 토큰·반품 기한(U24~U30) | 사용자 결정 |
| `ws-gateway` 사이트용/룸용 분화 필요성 | 6a 이후 측정 |
| 선택한 Redis 이미지 고정 후 인스턴스 분리(`redis-stock`/`redis-stream`) 재평가 | Phase 4 |
| 방 로그 모델: 자체 로그 룸(대국·채팅) 외에 `room_log` 가 필요한 룸이 생기는지 | 새 룸 종류가 생길 때(현재 해당 없음) |

## 16. 사용자 결정 목록 (U1~U30 전부 확정 — 2026-11-05)

영역 설계가 남긴 미결 중 **기술 근거만으로 정할 수 없는 항목**이다. 2026-11-05 사용자가 U1~U30 을 모두 확정했다(U24~U29 는 앞선 대화에서 확정). 행마다 **구분**을 적는다: **[권장수용]** = Claude 가 제시한 권장안을 사용자가 선택, **[사용자 변경]** = 권장안과 다르게 사용자가 직접 선택. 결정이 행의 서술과 다르면 행을 결정에 맞게 고쳤다. 확정 이후 변경은 개정 ADR 로 한다(U1).

| # | 결정 | 선택지 | 권장 | 영향·시점 |
|---|---|---|---|---|
| U1 | **ADR-030~048 확정** | 일괄 확정 / 개별 수정 | 영역별 검토 후 확정(Phase 착수 직전) | 설계 기준선. 확정(2026-11-05)으로 구현 근거로 쓴다 <br>**결정**: **확정(2026-11-05) [권장수용]** ADR-030~048 지금 일괄 확정(Accepted). 이후 변경은 개정 ADR |
| U2 | **경계 규칙 B12 허용 쌍(§2.4 표) 승인** | 승인 / 쌍 축소(사가로 대체) | 승인 | 상거래·CS 의 원자성. 거절하면 사가·보상 경로가 늘어난다 <br>**결정**: **확정(2026-11-05) [권장수용]** B12 허용 쌍 10쌍 승인(§2.4) |
| U3 | **데모 모드 샌드박스 작업자·상담원 체험** | 허용(샌드박스 데이터만) / 운영자만 | 허용(읽기 위주, 시뮬레이션 쓰기) | P3·P4 화면 공개 범위, 별도 `demo_` 스키마 필요 <br>**결정**: **확정(2026-11-05) [권장수용]** 허용(샌드박스 데이터만), 별도 `demo_` 스키마 |
| U4 | **배송지·수취인 익명화 기한** | 30일(제안) / 7일 / 90일 | 30일 | 개인정보 보관 정책 시연(§9.6) <br>**결정**: **확정(2026-11-05) [권장수용]** 배송지·수취인 암호문 익명화 30일 |
| U5 | **실제 택배사 연동 여부** | 모의만(기본) / 한 곳 연동 | 모의만 | P3 어댑터 범위, 외부 계정·비용 <br>**결정**: **확정(2026-11-05) [권장수용]** 택배사 모의만 |
| U6 | **PG 선정**(Phase 5 착수 시) | 토스페이먼츠(1순위 후보) / 기타 | 착수 시 공식 문서 재확인 후 | 가입 조건·웹훅 서명 방식 미확인 <br>**결정**: **확정(2026-11-05) [권장수용]** 토스페이먼츠 테스트 모드 확정(가입 조건이 안 맞으면 모의 PG 폴백; 조건·웹훅 서명은 Phase 5 착수 시 공식 문서로 재확인) |
| U7 | **보관 기간** | 대국 채팅 30일 / CS 1년 / 신고 스냅샷 90일 / 결제 이벤트 90일 / 택배 이벤트 90일(모두 제안) | 제안값 | 개인정보 정책. 법적 의무는 법무 검토 필요·미확인 <br>**결정**: **확정(2026-11-05) [권장수용]** 제안값 수용(대국 채팅 30일·CS 본문 1년·신고 스냅샷 90일·결제 이벤트 90일·택배 이벤트 90일; 설정값, 법적 의무는 법무 검토 전 미확인) |
| U8 | **Redis vs Valkey**(Phase 3 시작) | Redis / Valkey | 라이선스·이미지 확인 후 | 컨테이너 이미지, 클라이언트 <br>**결정**: **확정(2026-11-05) [사용자 변경]** Redis 확정(Valkey 아님; 최신 버전 라이선스 조건은 Phase 3 착수 시 공식 문서로 확인). 권장은 Valkey 였다 |
| U9 | **Streams 채택 여부**(Phase 3 측정 후) | Postgres 폴링 유지 / Streams / 둘 혼합 | 측정 합격선(ADR-031) 미달일 때만 Streams | 컨테이너·운영 복잡도 <br>**결정**: **확정(2026-11-05) [권장수용]** 측정 합격선(ADR-031) 미달일 때만 Streams, 기본 Postgres 폴링 |
| U10 | **에스크로 자동 확정 기한** | 7일(제안, 시연용 압축 가능) / 14일 | 7일 | ADR-016 미결 해소 <br>**결정**: **확정(2026-11-05) [권장수용]** 에스크로 자동 확정 7일(시연은 `ESCROW_TIME_SCALE` 압축). ADR-016 미결 해소 |
| U11 | **바둑 규칙 범위** | 중국식만 / 일본식 추가 / 무르기(undo) | 중국식만 | P1 룰 엔진·시험 세트 크기 <br>**결정**: **확정(2026-11-05) [사용자 변경]** 중국식 + 일본식 + 무르기(undo) 모두 구현. 권장은 중국식만이었다. **설계 반영은 별도 작업 진행 중**(P1 룰 엔진·시험 세트, ADR-034·035) |
| U12 | **KataGo 실행 방식** | 라이브 호스트 CPU 저우선 / 오프라인 배치 / 보류 | 호스트 RAM·CPU 확인 후(Phase 2 스파이크) | 자원 예산(D14) <br>**결정**: **확정(2026-11-05) [권장수용]** 라이브 호스트 CPU 저우선순위, 코어 2~3개 제한(집 서버는 구형 Xeon → Phase 2 스파이크 재측정) |
| U13 | **Solana devnet 에스크로(6d)·마작(6e) 진행 여부** | 진행 / 보류 | 경계(포트)만 설계 유지, 착수는 보류 | 일정 <br>**결정**: **확정(2026-11-05) [권장수용]** 6d 진행, 6e(마작) 보류(경계만 유지) |
| U14 | **KEK/DEK 상향 시점 승인**(Phase 5 착수 전, §9.3) | 승인 / 늦춤 | 승인 | ENC 필드 7개, 키 관리 <br>**결정**: **확정(2026-11-05) [권장수용]** Phase 5 착수 직전 KEK/DEK v2 상향 승인 |
| U15 | **모의 면책·약관·환불 정책 문구** | 사용자 제공 | 제공 필요 | 법적 오해 방지(ADR-015, D18), design/12 <br>**결정**: **확정(2026-11-05) [권장수용]** Claude 가 ko/en 초안 작성 후 사용자 검토(법률 자문 아님) |
| U16 | **Web Push 채택 여부와 구독 토큰 등급**(P4, Phase 6 후반) | 채택 / 앱 내 읽지 않음 표시만 | 앱 내 표시만(Web Push 동작 미확인) | CS 응답 알림 수단, 구독 토큰 ENC 등급 <br>**결정**: **확정(2026-11-05) [권장수용]** 앱 내 읽지 않음 표시만(Web Push 미채택) |
| U17 | **금칙어 정책: 마스킹 vs 거절**과 초기 목록(P4, 6a 착수 전 — 채팅 코어 도입 시) | 마스킹 / 거절 | 거절(우회 감소, 오탐은 신고로 보완) | 채팅 UX·모더레이션 부담 <br>**결정**: **확정(2026-11-05) [사용자 변경]** 금칙어 마스킹(`***` 치환 후 전송). 권장은 거절이었다. **설계 반영은 별도 작업 진행 중**(P4, ADR-045) |
| U18 | **포인트:원 환산 비율**(P2) — `POINT_KRW_RATE` 는 **1:1 고정으로 선언**(설정값 아님) | 1:1 고정 / 별도 비율(ADR 개정 필요) | 1:1 고정 | 포인트 결제 금액·바둑 보상 크기 <br>**결정**: **확정(2026-11-05) [권장수용]** 1 POINT = 1 KRW 고정 확인 |
| U19 | **캡차/가상 대기열 도입 여부**(P2, 타임딜 부하 시험 후) | 도입 / 속도 제한·입장 토큰만 | 부하 시험 결과 후(기본은 입장 토큰만) | 봇 구매 방어·UX <br>**결정**: **확정(2026-11-05) [권장수용]** 입장 토큰·속도 제한만(캡차·가상 대기열 미도입) |
| U20 | **seller 포털 필요 여부**(D11) | 두지 않음(단일 판매자) / Phase 6 이후 별도 ADR | 두지 않음 | 상품·딜 관리 화면, 권한 모델 <br>**결정**: **확정(2026-11-05) [권장수용]** seller 포털 두지 않음(단일 판매자) |
| U21 | **익명 플레이어 허용 확인**(P1 §10 은 비레이팅 대국 허용, P4 는 '플레이어 로그인 권장'): 플레이어 로그인 필수 여부, 관전자 익명 허용 | 로그인 필수 / 익명 비레이팅 허용 | 익명 비레이팅 허용(뮤트 우회 위험을 위험표에 기록) | 진입 장벽 vs 모더레이션 <br>**결정**: **확정(2026-11-05) [사용자 변경]** 플레이어 로그인 필수(관전자만 익명 허용), 익명 비레이팅 대국 폐지. 권장은 익명 비레이팅 허용이었다. **설계 반영은 별도 작업 진행 중**(P1 §5·§10, P4) |
| U22 | **분석 INCONCLUSIVE 처리**(P1/ADR-037): 2단계 후에도 결론이 안 나면 | CLEAN 취급(확정) / 수동 검토 큐 | CLEAN 취급(보수적 박탈 회피, 지표·감사 기록) | 보상 무결성 vs 운영 부담 <br>**결정**: **확정(2026-11-05) [권장수용]** INCONCLUSIVE 는 CLEAN 취급 + 지표·감사 기록 |
| U23 | **교환(반품+신규 주문) UX와 분할 배송의 구매자 노출**(P3, W4·W5) | 단순화(반품 후 재주문) / 교환 흐름 구현 | 반품 후 재주문 | P2·P3 UI 범위 <br>**결정**: **확정(2026-11-05) [사용자 변경]** 교환 흐름 구현(반품 + 연결된 신규 주문, 분할 배송 구매자 노출). 권장은 반품 후 재주문이었다. **설계 반영은 별도 작업 진행 중**(P2·P3, ADR-040) |
| U24 | **첫 로그인 지급 정책**(G1·D25): **원장 지급은 POINT 100,000 만**(사용자 결정 2026-11-05 개정; 당초 안은 USDC 10,000 + POINT 1,000, 개정 1: POINT 1,000 만, 개정 2: 100,000 으로 상향 — U27). USDC 는 원장에서 고정액으로 자동 지급하지 않고 테스트넷 환경에 따라 공급한다 — 설정 `WELCOME_GRANT_USDC_MICRO`(환경별 값; 로컬·시험은 시험용 값, 라이브 기본 0), 지갑 연결 사용자는 Circle faucet 으로 본인이 받은 devnet USDC 를 쓰는 6d 경로. 사용자당 1회, 재충전 없음, 관리자 지급 건당 상한. POINT 단독 결제도 가능하고 혼합 결제·교환 설계는 유지. 하위 질문(지갑 없는 라이브 사용자에게 USDC 를 어떻게 줄 것인가) **해결(2026-11-05 사용자 결정): '지갑이 없으면 애초에 연결하지 못하니(=USDC 를 받을 수 없으니) 지갑 연결을 유도하고, 지갑 없는 사용자에게는 POINT 로 물건을 구매하는 경험을 준다.'** ① 지갑 없는 사용자는 USDC 를 받지 않는다(원장 USDC 지급·관리자 지급·지급액 상향은 채택하지 않음; 단 POINT 지급액 상향은 U27 (c) 로 채택) ② 화면에서 지갑 연결을 안내·유도한다(연결하면 devnet USDC 경로 6d) ③ POINT 단독 결제가 지갑 없는 사용자의 핵심 구매 경험이므로 시드 상품 중 POINT 100,000 안에서 살 수 있는 상품이 다수 있어야 한다(U27) | (해결됨) 검토했던 안: 원장 USDC 지급액 상향 / 관리자 지급 / 지갑 연결 유도 → 지갑 연결 유도만 채택 | 하위 질문 해결(2026-11-05), 금액·재충전 정책은 기존대로 | Phase 3 시연 흐름, 지갑 연결 안내 화면, POINT 로 살 수 있는 시드 상품(U27), 어뷰징 방어 |
| U25 | **총 발행 상한**(G1): `ledger.supply_cap.cap` 은 `numeric(40,0)`, 값은 **signed 64-bit 최대 9223372036854775807**(마이크로 단위; 각 잔액 컬럼이 BIGINT 인 한 합이 이를 넘을 수 없다). 원자 UPDATE 구조(T8)는 구조 방어로 유지하되 실질 무제한이며, 남용 방어는 사용자당 1회 지급(`github_id` 유일)과 속도 제한이 맡는다 | — | **확정(2026-11-05)** | 가입 농사 방어는 지급 유일성·속도 제한에 의존, 경보 기준 |
| U26 | **교환 한도**: `ExchangeUsdcToPoint` 은 **무제한**(일일·건당 상한 없음). 잔액 부족 검사, 견적 만료, `maxUsdcMicro` 보호, `write.exchange` 속도 제한(남용 방어이며 한도가 아니다)은 유지 | — | **확정(2026-11-05)** | 차익·남용은 견적 만료·속도 제한으로 제어 |
| U27 | **시드 상품 가격**: 실제 쇼핑몰(네이버 쇼핑 등)에서 대표 상품을 조사해 **참고 가격을 표시**하는 방식. `catalog.product` 에 `reference_price_krw`·`reference_source`(출처 이름)·`reference_checked_on`(확인일). 자동 수집(스크래핑)은 하지 않고 사람이 Phase 3 착수 시 조사해 `seeds/products.*` 에 기록한다. 이미지는 쇼핑몰 것을 복사하지 않는다(저작권·약관; 자체 일러스트 또는 무이미지). 화면에 '시점 스냅샷이며 실제 거래가 아님'을 표기한다. 실제 가격 수치는 아직 확보하지 못했다. **참고: 지갑 없는 사용자는 USDC 를 받지 않으므로(U24 해결) POINT 단독 구매가 핵심 경험이고, 시드 상품 중 POINT 100,000 안에서 살 수 있는 상품이 다수 있어야 한다. 지갑 연결 사용자의 USDC 경로(6d)·교환 경로는 추가 구매력일 뿐 전제가 아니다.** **가격 충돌은 해결(2026-11-05 사용자 결정): (c) 로 푼다** — 첫 로그인 POINT 지급을 1,000 → **100,000**(1 POINT = 1 KRW, 100,000 POINT = 100,000 KRW)으로 올리고 시드 상품은 **대략 현실 금액(참고가 그대로)** 을 쓴다. 폐기한 안: (a) 참고가 스케일링, (b) 소액 상품군 필수 포함(소액 상품을 넣는 것은 자유). 시드 상품은 참고가 대부분이 100,000원 이하가 되도록 조사하고, 100,000원을 넘는 상품은 USDC 교환·혼합 결제의 시연 대상으로 둔다. 총 발행 상한(U25)은 이미 최대치라 그대로다. | — | 방식 확정(2026-11-05), 가격 확정 (c) 로 해결(2026-11-05), 가격 조사는 Phase 3 착수 시 | 시연 현실감, 구매 가능성 |
| U28 | **온체인 시연 토큰**(6d): **자체 발행 `tUSDC`(devnet 모의 토큰)를 기본**으로 하고 설정 `SETTLEMENT_MINT` 로 Circle devnet USDC(민트 `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, Circle 문서 developers.circle.com/stablecoins/usdc-contract-addresses; Circle faucet 과 Coinbase CDP faucet 이 같은 민트로 보낸다 — 2026-11-05 검색)에 연결할 수 있다. 이유: 지갑 연결이 유도 경로라 외부 faucet(한도는 제3자 자료 기준 Circle 20 USDC/2시간/주소 — Circle 자체 페이지 미확인; Coinbase CDP 1 USDC/요청·10 USDC/24시간) 두 곳을 거치면 이탈하므로 사이트가 tUSDC 를 발행해 주고 devnet SOL 수수료를 대납(fee payer)한다. 요구: 토큰 메타데이터 이름 'Test USDC (demo)', 화면에도 `tUSDC` 명시(진짜 USDC 와 오인 방지), **민트 권한 키·수수료 대납 키는 비밀(devnet 전용, ADR-026 비밀 관리 대상으로 등재)**, 지갑당 발행 속도·횟수 제한, `SETTLEMENT_MINT` 가 Circle USDC 일 때는 사이트가 발행하지 않고 사용자가 Circle faucet 으로 받은 것을 쓴다(수수료 대납은 유지 가능). 개정 이력: 같은 날 앞서 '권고는 Circle devnet USDC, 한도가 막을 때만 tUSDC 폴백'으로 적었으나 사용자 확정으로 기본이 tUSDC 로 바뀌었다 | tUSDC 기본 / Circle USDC 는 `SETTLEMENT_MINT` 로 선택 | **확정(2026-11-05)** | 방문자 시연 마찰, 발행 남용·수수료 키 고갈 방어 |
| U29 | **devnet 수수료(SOL) 부담**: 플랫폼 대납 vs 사용자 파우셋 | **확정(2026-11-05)**: 플랫폼 대납 + 안전장치 — ① 지갑당 대납 횟수·일일 총량 상한 ② 대납 키 SOL 잔액 기준 이하 시 Discord 경보(ADR-027 경로; 게이지 `pf_wallet_fee_payer_balance_lamports` 제안) ③ 잔액 고갈 시 '사용자 faucet 안내' 화면으로 자동 폴백(지갑 연결·원장은 정상). 사용자 1명당 약 0.003 SOL 추정(서명당 약 5,000 lamports·토큰 계정 임대료 약 0.002 SOL, 미검증), 상한 숫자는 6d 착수 시 확정. 대납 키는 비밀 관리 대상(ADR-026) | 6d 착수 전 상한 숫자·수수료 값 재확인 | 대납 키 잔액 고갈, 키 관리 |
| U30 | **반품 가능 기한**(`RETURN_WINDOW_DAYS`, P2·P3): 배송 완료(또는 `demo` 주문 종결) 후 5일(제안) < 에스크로 자동 해제 7일 | 5일 / 7일 미만의 다른 값 | 5일 | 반품 UX, 에스크로 동결 시점 <br>**결정**: **확정(2026-11-05) [권장수용]** 반품 가능 기한 5일 |

### 16.1 재확인·착수 시점 (구현 순서 기준)

**U1~U30 은 모두 2026-11-05 에 확정되었다.** 아래 표는 결정 시점이 아니라 **각 결정을 재확인하거나 그 결정에 따른 작업을 착수하는 시점**이다. 재확인은 결정을 뒤집는 것이 아니라 확정 당시 미확인으로 남긴 외부 사실(라이선스·가입 조건·법적 의무·실측)을 그때 공식 자료로 확인하는 것이다.

| 시점 | 재확인/착수 항목 |
|---|---|
| **지금(M1 착수 전)** | M1 명세 확정. U1(ADR 일괄 Accepted)·U2(B12 승인)는 반영 완료 |
| **Phase 3 착수 전** | U8(Redis 최신 버전 라이선스 조건 확인), U9(Streams 는 측정 후 합격선 미달 시에만), U18(1:1 고정 반영), U19(입장 토큰·속도 제한 구현, 부하 시험으로 확인), U24~U27(지급·시드 상품 가격 조사), U4(익명화 30일 — 배송지 ENC 도입 시), U10(에스크로 7일 — 최소 escrow 도입 시), U15(모의 면책·약관 ko/en 초안 작성 후 사용자 검토), U20(seller 없음 반영) |
| Phase 4 | HPA 사용자 지정 지표 방식(§15) |
| **Phase 5 착수 전** | U6(토스페이먼츠 가입 조건·웹훅 서명 공식 문서 재확인, 안 맞으면 모의 PG), U14(KEK/DEK v2 상향 실행), U30(반품 기한 5일 반영), U7 의 결제 이벤트 보관 |
| 6a 착수 전 | U3(`demo_` 샌드박스 구현), U16(앱 내 읽지 않음 표시), **U17(마스킹 — 설계 반영 별도 작업 진행 중)**, U7 의 CS 본문·신고 스냅샷 보관 |
| 6c 착수 전 | U5(택배사 모의만), **U23(교환 흐름 — 설계 반영 별도 작업 진행 중)**, U7 의 택배 이벤트 보관 |
| 6d 착수 전 | U29(상한 숫자·수수료 값만 재확인), U13(6d 진행 확정) |
| 6e | U13(마작 보류 — 재개 시 별도 판단) |
| **Phase 1 착수 전(바둑 계열)** | **U11(중국식+일본식+무르기 — 설계 반영 별도 작업 진행 중)**, **U21(플레이어 로그인 필수 — 설계 반영 별도 작업 진행 중)**, U7 의 대국 채팅 보관 |
| Phase 2 착수 전 | U12(KataGo 코어 2~3개 저우선순위 — 구형 Xeon 이라 스파이크 재측정), U22(INCONCLUSIVE 는 CLEAN 취급 + 지표·감사 기록) |

바둑 관련 결정은 뒤로, 타임딜·결제·PG 선정은 앞으로 당겨졌다. 위 시점은 각 Phase 의 설계 재검토(§12.5)에서 다시 확인한다.
