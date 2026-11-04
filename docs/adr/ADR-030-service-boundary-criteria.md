# ADR-030: 서비스 경계 기준 — 모놀리스 유지, 5축 판정, KataGo 만 분리
- 상태: **Proposed** (사용자 확정 대기)
- 날짜: 2026-11-04
- 근거: 사용자 요청(기획안 4개 영역 아키텍처 설계) / ADR-001(모듈러 모놀리스) / ADR-009(KataGo 비동기) / M1 실측(Bun WS 안정·메모리)
- 관련 문서: [phases/00 §2~3](../design/phases/00-platform-evolution.md)

## 맥락
Phase 1~6 은 모듈이 많이 늘어난다(game, chat, analysis, ledger, catalog, deal, order, payment, escrow, settlement, pricefeed, inventory, fulfillment, support). 어느 것을 서비스로 떼고 어느 것을 모듈로 둘지 기준이 없으면 영역마다 다르게 판단한다. 무료 호스팅(단일 호스트)에서는 서비스 하나의 비용(계약·분산 장애·메모리)이 크다.

## 결정
1. **기본값은 분리하지 않는다.** 모놀리스 모듈로 둔다(ADR-001 유지).
2. 분리 판정은 **5축**(독립 확장 · 언어/런타임 · 자원 프로파일 · 장애 격리 · 배포 주기). **둘 이상이 강하게** 해당할 때만 별도 프로세스·이미지를 검토하고, 하나만 해당하면 **엔트리포인트 분화**(같은 이미지)로 푼다.
3. 판정 결과: **KataGo 분석 워커만 분리**(Phase 2). 나머지 모듈은 유지한다. `ws-gateway` 의 사이트용/룸용 분화는 Phase 4 에서 엔트리포인트 인자로 한다.
4. **모듈 간 동기 의존은 피호출 층 ≤ 호출자 층일 때만**(L0~L5, **같은 층 허용**) 허용한다(경계 규칙 B12). 위 방향은 이벤트. 하위 모듈이 상위 상태를 알아야 하면 **포트를 소유하고 상위가 구현을 등록**한다(의존 역전). 같은 층 호출이 허용되므로 층 규칙만으로는 순환이 막히지 않고 **모듈 순환 금지 B5 가 함께** 검사한다.
5. **모듈 간 한 트랜잭션은 `*InTx` 공개 usecase 의 허용 쌍으로만** 한다(B12의 두 번째 절, 정본은 [phases/00 §2.4](../design/phases/00-platform-evolution.md)). 요지: ① `TxContext` 를 첫 인자로 받고 `uow.run` 을 부르지 않는 함수만 참여 가능(M1 F16 §8.2 의 중첩 금지는 유지) ② 트랜잭션을 연 command usecase 하나가 조율자 ③ 직접 호출은 피호출 층 ≤ 호출자 층, 더 높으면 호출자 소유 포트로 역전 ④ 허용 쌍은 정본 표 10건(support→chat, order→deal·ledger·payment·escrow, analysis→ledger, payment→ledger·order·escrow, escrow→ledger, settlement→ledger, fulfillment→inventory)이고 목록 밖은 CI 실패. 쌍 #1 의 조율자는 support 의 `OpenTicket`·`ClaimTicket`·`ReleaseTicket`·`ReplyTicket`·`ResolveTicket`·`CloseTicket`·`TicketAutoCloser`·`TicketLeaseReaper`이고 호출은 chat 의 `OpenRoomInTx`·`PostMessageInTx`·`CloseRoomInTx`·`AddParticipantInTx`·`RemoveParticipantInTx`, 쌍 #10 의 조율자는 fulfillment 의 `AcceptOrder`(할당 포함 단일 tx)·`DispatchShipment`/`HandOverShipments`·피킹·패킹·PUTBACK·반품 입고·재입고 작업이고 호출은 inventory 의 `AllocateInTx`·`ReleaseAllocationInTx`·`IssueInTx`·`RecordMovementInTx`(다품목은 `sku_id` 오름차순). **쌍 #11(`realtime.AppendRoomLogInTx`)은 미사용 예약** — 룸 지연 예산 초과가 측정으로 확인될 때만 이 ADR 개정과 함께 추가 ⑤ 외부 호출 금지, 각 `InTx` 가 자기 outbox 를 같은 tx 에 기록. **`game → ledger`·`game → chat`·`fulfillment → order`·`inventory → deal` 은 허용하지 않고 이벤트로만** 연결한다.

## 설계 상세
층: L1 identity·events·observability / L2 realtime·catalog·pricefeed / L3 game·chat·deal·guestbook / L4 analysis·ledger·order·inventory / L5 payment·escrow·settlement·fulfillment·support.

층: 분석 워커(`analysis`)는 `ledger` 와 같은 L4 이고 쌍 #6 은 동층 호출이다(R3 허용).

**B12 검사 구현(제안)**: `modules/layers.json`(모듈→층)과 `modules/tx-pairs.json`(허용 쌍)을 정본 파일로 두고 `check:arch` 가 dependency-cruiser 결과와 대조한다 — (a) 타 모듈은 `index` 만 임포트, (b) 직접 임포트는 피호출 층 ≤ 호출자 층, (c) `…InTx` 심볼 임포트는 `tx-pairs.json` 의 (호출자 모듈→함수)만, (d) `*-in-tx.ts` 는 `UnitOfWork`·`.run(` 을 임포트/호출하지 않음. 쌍마다 **원자성 계약 시험**(조율자 롤백 시 참여 모듈 변경·outbox 가 남지 않음)을 둔다. 후보별 판정표와 의존 그래프는 phases/00 §2~3.

## 대안과 기각 이유
- **서비스 다수로 분리(MSA)**: 무료 단일 호스트 자원·계약 비용 과다. ADR-001 의 서사("필요가 증명된 지점만 분리")와 반대.
- **분리 후보를 지금 확정**: 필요가 측정으로 증명되기 전이다. 기준으로 판정하고 결과만 기록.
- **KataGo 도 모듈로(같은 프로세스)**: CPU 폭주가 사이트 전체를 위협하고 네이티브 바이너리가 필수.

## 결과
- 얻는 것: 판정이 재현 가능하고, 모듈 추가가 구조 규칙(층)으로 통제된다.
- 치르는 것: 분석 워커의 별도 이미지·자원 한도 관리, 층 규칙(B12) 검사 추가.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 층 배치가 어색한 모듈 | 층은 제안이며 영역 설계에서 조정, 변경은 이 ADR 갱신 |
| 분리 후 계약 불일치 | 분석 요청/결과는 이벤트 스키마(05 규약) + 골든 JSON 시험 |

## 검증 방법
CI 의존성 검사 B12(층 + `InTx` 허용 쌍, 허용 목록 밖 호출 샘플이 실패), 쌍별 원자성 계약 시험, 분석 워커 kill 후 재선점 시험(ADR-021), 사이트 부하 중 분석 동시 실행 시 p95 비악화.

## 재검토 조건
분리 후보가 늘 때, 룸 실시간이 `--surface=room` 분화로 부족해 별도 서비스가 필요하다고 측정될 때.

## 관련 ADR
ADR-001, ADR-009, ADR-012, ADR-021, ADR-022
