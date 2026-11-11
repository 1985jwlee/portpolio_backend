# G11 — 모듈 추출 가능성 (S0-8 외, ADR-052 결정 5)

[ADR-052](../../docs/adr/ADR-052-extractable-monolith.md) 결정 1~6(계약 패키지·경계 버전·`ActorContext` 주입과 서명 토큰·추출 게이트)이 **구조적으로 성립하는가** 시험한다. 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md). **제품 코드가 아니다.**

> **합성 모듈이다.** 제품 코드가 아직 없어 guestbook 의 도메인 로직·DB 는 없다(메모리 구현, 글 등록·목록 둘). 이 시험이 증명하는 것은 **패키징·임포트 규칙·버전 게이트·토큰 직렬화·인프로세스와 별도 프로세스의 계약 동등성**이다. 실제 guestbook 의 추출은 구현 후에 같은 게이트로 다시 확인한다.

## 환경 고정
Bun 1.4.4, 외부 의존 없음(`node:crypto`·`Bun.serve`·`fetch` 만). 실행: `bun g11.ts`. 임시 폴더에서 복사본으로 위반을 주입하므로 저장소 파일은 건드리지 않는다.

## 구성
`packages/kernel`(`Result`·`ActorContext`·HS256 서명 토큰) · `modules/guestbook-contract`(DTO·`GuestbookPort`·검증기·`schemas.ts`·`contract.lock.json`) · `modules/guestbook`(구현) · `modules/guestbook-client`(같은 포트의 HTTP 어댑터) · `modules/realtime`(소비자, 포트만 안다) · `apps/guestbook-service`(분리된 서비스 엔트리). 규칙 ID: **G-a** 선언 안 한 `@pf/*` 의존 · **G-b** 모듈이 다른 모듈의 구현 임포트(계약·kernel 만 허용) · **G-c** 패키지 밖으로 나가는 상대 경로 · **G-d** 계약 패키지가 kernel 외 임포트 · **G-e** kernel 이 무언가 임포트 · **V-1** 계약 해시가 바뀌었는데 버전이 오르지 않음. 게이트 `tools/gate.ts` 는 정규식 스캔이다(dependency-cruiser 아님).

## 시험 전에 고정한 기준 (2026-11-11)
| # | 기준 | 합격 |
|---|---|---|
| 1 | **깨끗한 트리**: `gate imports` 와 `gate version` 이 위반 0 으로 종료 코드 0 | 둘 다 |
| 2 | **음성 대조(임포트)**: 복사본에 위반 다섯을 하나씩 주입한다 — ⓐ realtime 이 `@pf/guestbook`(구현)을 선언하고 임포트 → G-b ⓑ realtime 의 package.json 에서 `@pf/guestbook-contract` 선언 제거 → G-a ⓒ realtime 이 `../../guestbook/src/index` 상대 임포트 → G-c ⓓ 계약 패키지가 `lodash` 임포트 → G-d ⓔ kernel 이 계약을 임포트 → G-e | 다섯 모두 종료 코드 ≠0 이고 출력에 기대한 규칙 ID |
| 3 | **격리 빌드**: 6개 단위(kernel·계약·guestbook·client·realtime·service)를 **선언한 의존만 복사한** 임시 폴더(`node_modules/@pf/<dep>` 복사본)에서 `bun build` 한다 | 6/6 성공 |
| 4 | **격리 빌드 음성 대조**: realtime 을 빌드하되 `@pf/guestbook-contract` 복사본을 뺀다 | 실패(해석 불가) |
| 5 | **버전 게이트**: 복사본에서 ⓐ 스키마 필드를 추가하고 버전 유지 → V-1 로 실패 ⓑ 같은 변경에 버전을 2.0.0 으로 올림 → 통과 ⓒ 스키마 불변·버전만 올림 → 통과 | 셋 모두 기대대로 |
| 6 | **추출 동등성**: 같은 시나리오(A가 글 등록, B가 등록, A가 빈 본문·201자 본문 등록 시도, A·B 목록, `realtime.buildSnapshot` A·B)를 ⓐ 인프로세스 `createGuestbook` ⓑ **kernel·계약·guestbook 만 복사한 폴더에서 별도 프로세스로 띄운 서비스**를 `guestbook-client` 로 호출 — 두 결과(JSON)가 완전히 같다. 서비스 폴더의 `node_modules/@pf` 에는 위 셋만 있다 | 동일 + 셋만 |
| 7 | **토큰**: 유효 토큰 → 200 / 서명 변조·만료·audience 불일치·`alg: none`·헤더 없음 → 모두 **401** | 6/6 |
| 8 | 위 1~7 을 3회 반복해도 같다(반복마다 새 임시 폴더·새 서비스 프로세스) | 3/3 |

**판정**: 1~8 모두 합격이면 PASS(추출 가능성의 구조적 증거 확보). 하나라도 실패하면 FAIL — 해당 규칙·구조를 ADR-052 에서 수정한다. 기준은 결과를 본 뒤 바꾸지 않는다(하네스 오류는 기준 변경 없이 고치고 커밋 메시지에 기록).

## 발견 후 추가 (2026-11-11, 첫 실행 뒤 — 첫 실행의 사전 고정 판정은 FAIL 이다)
첫 실행(`results/…02-55-52…-g11.json`, 커밋 `2f48502`)에서 **기준 4 가 3회 모두 실패**했다. `realtime` 은 계약을 `import type` 으로만 가져와 **런타임 임포트가 0** 이라, 계약 복사본을 빼도 `bun build` 가 성공한다. 즉 **번들 시험은 타입 전용 의존의 누락을 보지 못한다.** 기준 4 는 바꾸지 않고 FAIL 로 둔다. 다음 두 기준을 보완으로 **따로** 더한다(판정에 섞지 않고 ‘보완’ 으로 보고한다):

| # | 기준 | 합격 |
|---|---|---|
| 4b | 런타임 임포트가 있는 `guestbook-client` 를 계약 복사본 없이 격리 빌드하면 | 실패(해석 불가) |
| 4c | 격리 폴더에서 `tsc --noEmit` 로 `realtime` 을 타입체크할 때, 계약 복사본이 있으면 `@pf/*` 해석 오류(TS2307)가 없고, 없으면 `@pf/guestbook-contract` 에 대한 TS2307 이 난다 | 둘 다 |

4c 의 한계: 격리 폴더에 Bun/Node 타입이 없어 `node:crypto`·`Buffer` 오류가 따로 나므로 **TS2307 중 `@pf/*` 만** 센다. 모듈 간 계약(타입 전용 포함)을 CI 에서 지키려면 번들이 아니라 **타입체크 격리**가 필요하다는 것이 이 발견의 설계 함의다.

## 한계 (시험 전에 적는다)
- 합성 모듈·메모리 구현. DB·마이그레이션(G10b 가 따로 다룸)·`InTx` 쌍·이벤트 소비(inbox)·인증 쿠키 해석은 없다.
- 서비스 간 전송은 HTTP 로 대체했다(프로토콜은 미정 — gRPC 여부). 지연·오류 전파·재시도는 시험하지 않는다.
- 토큰은 HS256 수작업 구현이고 키 회전·재생 방지는 없다. 라이브러리 비교는 범위 밖.
- 게이트는 정규식이라 동적 임포트·별칭 경로를 못 본다. 워크스페이스 링크는 선언 안 한 의존도 해석해 주므로 정적 검사와 격리 빌드를 함께 쓴다.
- 개발 PC 한 곳.
