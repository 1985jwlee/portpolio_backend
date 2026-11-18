# 코드 해설 — check-purity 정규식 → swc AST 전환과 기술부채 TD-1·2·3 상환 (가칭 S1-5b)

## TL;DR — 이 변경을 한 문장으로
- `scripts/check-purity.ts` 의 정규식 11개를 swc AST 순회로 바꿔 `sql<number>`…`` 같은 표기를 놓치던 구조적 미탐을 없앴고, 같은 런에서 Windows 경로 구분자 버그(`scripts/arch.ts`)와 문서 부채(TD-2)를 닫았다. 공개 표면(`scanPurity`·`PURITY_RULE_IDS`·`{rule, from, line}`)은 그대로다.
- 결과: `bun test` 122 통과/0 실패(기준선 103/3 실패), `bun run arch` 종료 0(기준선 종료 1, `GUARD-uncruised` 83건). 리뷰 판정 🟢, Critical·Major 0.
- 이름 `S1-5b` 는 가칭이다 — 확정은 사용자 몫(`docs/design/11-implementation-plan.md` S1-5 행 바로 아래 행).

## 전체 그림
- `bun run arch` 는 dependency-cruiser(그래프 규칙)·`check-cqrs`·`check-purity`(문자열 규칙 B9·B2·B11)를 한 번에 돌려 종료 코드 0/1 을 낸다. 이 중 `check-purity` 만 소스 텍스트를 정규식으로 훑었고, KB #9 가 기록한 대로 리뷰마다 새 우회 표기(구조분해·옵셔널 체이닝·줄바꿈·주석 삽입·타입 인자)가 나왔다. 제품 코드가 0줄인 지금이 엔진 교체 비용이 가장 낮아 TD-1(기한 S2-1 이전)을 당겨 닫았다.
- 범위는 사용자 확정(Q1): TD-1 + TD-2 + TD-3 소멸 확인. TD-4(S1-6)·TD-5(S1-2/3 전)·TD-6 은 담당 작업 몫이라 `tech-debt.md` 에서 건드리지 않았다(TD-5 는 문서 선반영도 하지 않음).

## 코드 블록별 해설
선별 기준: 판단이 들어간 자리·함정·나중에 고칠 자리. 나머지(`isRecord`·`isAstNode`·`isIdentifier`·`staticName`·`isGlobal`, `RULES` 표 골격)는 AST 노드를 좁히는 보조 함수라 생략한다.

### scripts/check-purity.ts — 파싱과 줄 번호 (`parseWithLines`, :414 / `base`, :433)
- **목적**: swc 가 돌려주는 위치(span)를 원본 텍스트의 줄 번호로 바꾼다.
- **한 줄 해설**: swc span 은 UTF-8 바이트 기준이고 호출마다 시작값이 달라질 수 있어(1.15.3 에서 누적 실측), 텍스트 끝에 `\n;;` 를 붙이고 그 마지막 빈 문의 span 으로 기준 오프셋을 뺀다. 줄 시작 표도 UTF-8 바이트로 만든다.
- **왜 뒤에 붙이나**: 앞붙임은 셰뱅 파일에서 파싱이 실패한다(계획 실측). `;` 하나로는 앞 문장의 세미콜론 자동 삽입에 먹혀 빈 문이 안 남을 수 있어 둘을 붙인다.
- **함정**: 이 보정은 이 호스트의 swc 1.16.22 에서 값이 0이다(4회 파싱 시작값 `[11,11,11,11]`). 그래서 보정을 지워도 시험이 초록이다(리뷰 m-1). 가드가 실효인 것은 1.15.3 에서뿐이다(보정 제거 시 36 통과/51 실패). 1.16.22 가 누적하지 않는다는 것은 관측일 뿐 swc 의 계약이 아니다.
- **수정 포인트**: swc 버전을 바꾸면 `줄 번호 — swc 위치…` 시험 묶음(`check-purity.test.ts`)을 새 버전에서 보정 제거로 다시 빨갛게 만들어 본다.

### scripts/check-purity.ts — 파일당 파싱 1회 + 명시 스택 순회 (`walk`, :442 / `scanPurity`, :467)
- **목적**: 규칙별로 다시 파싱하지 않고 AST 를 한 번만 내려가며 모든 규칙의 판정 함수를 적용한다.
- **한 줄 해설**: `span` 키는 건너뛰고 객체·배열 필드를 일반적으로 내려간다. 계획의 "재귀"를 명시 스택으로 바꿨다 — 긴 `a + b + …` 이항식 체인이 호출 스택을 넘기는 것을 피하려는 것이다.
- **함정**: 깊이 한계는 시험으로 재지 않았다(미확인). 적용 규칙이 0개인 경로는 파싱하지 않고, 구문 오류는 `경로: 구문 분석에 실패했다` 로 `cause` 를 담아 던진다(Q4) — 구문 오류 제품 소스가 생기면 `bun run arch` 가 예외로 죽는다(의도). arch 실행기 수준 종료 코드는 미확인이다.
- **수정 포인트**: 새 노드 종류를 보려면 순회는 건드리지 않고 판정 함수만 추가한다.

### scripts/check-purity.ts — 판정 함수와 `RULES` 표 (`detectors`, :141~:330 / `RULES`, :338)
- **목적**: 규칙별 위반을 "노드 판정 함수 배열"로 표현한다. 정규식의 `patterns` 칸이 `detectors` 로 바뀌었다.
- **한 줄 해설**: B9 `envMember`·`envDestructure`·`bunEnvImport`, B2 `timeRandomMember`·`bareDate`, B11 `writeCall`·`sqlTag`·`sqlRawCall`. 보고 줄은 멤버 접근·`new`·호출의 시작, 구조분해 패턴 `{`, 임포트 선언 시작, 쓰기는 호출된 속성 식별자의 줄이다. 규칙별 `applies`(경로 조건)는 그대로다.
- **새로 잡히는 것**: 정규식이 놓치던 6종(`sql<number>`…``·`.execute<Row>(`·`.execute?.(`·`crypto?.randomUUID()`·`performance?.now()`·`new globalThis.Date`). HEAD 의 정규식 엔진에서 6개 모두 실패함을 증명했다.
- **수정 포인트**: 규칙 추가·변경은 `RULES` 표의 해당 행과 판정 함수. 규칙 ID 4개(`PURITY_RULE_IDS`)는 바꾸지 않는다 — 문서 여러 곳이 ID 로 참조한다.

### scripts/check-purity.ts — 값을 감싼 노드 벗기기 (`WRAPPER_FIELD`, :69 / `unwrap`, :77) — 판단 보류 (a)
- **목적**: `(process as X).env`·`process!.env`·`(process).env`·`process?.env` 를 `process.env` 와 같은 접근으로 본다.
- **한 줄 해설**: 괄호·옵셔널 체이닝 래퍼·`!`·`as`·`satisfies` 를 벗기고 판정한다. 벗기지 않으면 `OptionalChainingExpression` 때문에 `?.env` 가 새 미탐이 된다.
- **함정**: 정규식은 `process` 와 `.env` 가 떨어져 있으면 못 잡았다 — 의미가 넓어진 것이고 계획 설계 4절은 언급하지 않았다. 시험으로 고정돼 있다.
- **수정 포인트**: 틀렸다고 보면 `WRAPPER_FIELD` 에서 `TsAsExpression`·`TsNonNullExpression`·`TsSatisfiesExpression` 행과 그 시험 1개를 지운다.

### scripts/check-purity.ts — 쓰기 `execute` 첫 인자 검사 (`startsWithRawText`, :274 / `leftChild`, :259) — 판단 보류 (b), 리뷰 m-2
- **목적**: `tx.execute("…")`·템플릿·`sql.raw(…)` 같은 날 SQL 쓰기를 잡는다. 정규식은 첫 인자의 첫 토큰만 봤다.
- **한 줄 해설**: 첫 인자의 맨 왼쪽 조각을 따라 내려가(이항식 왼쪽·멤버 객체·호출 피호출자) 문자열·템플릿 리터럴이나 `sql.raw` 가 나오면 위반으로 본다. `sql.raw(…)\n.as(…)` 체인이나 `"a" + x` 도 잡기 위해서다.
- **함정**: 과탐이다 — `db.execute("x".trim())` 도 `B11-write` 로 걸리고 `handler.execute(cmd)` 는 안 걸린다(리뷰가 실행 확인). 제품 소스가 0개라 현재 피해는 없고, 조용한 통과를 막는 TD-1 목적과 같은 방향이라 결함으로 보지 않았다. 사용자 확인 대상으로 남았다.
- **수정 포인트**: 과탐을 줄이려면 `leftChild` 순회를 없애고 첫 인자 노드 하나만 검사하게 줄인다(해당 시험도 조정).

### scripts/arch.ts — Windows 경로 정규화 (`enumerateSources`·`readDeclarations`)
- **목적**: 글롭 결과의 `\` 를 `/` 로 바꿔 dependency-cruiser 결과와 같은 표기로 맞춘다. `replaceAll("\\", "/")` 2곳(실변경 4줄).
- **한 줄 해설**: 이 정규화가 없어서 Windows 에서 `GUARD-uncruised` 오탐 83건·`bun test` 3 실패(T1·T2·T7)가 났고, 경로 판정이 어긋나 purity 대상 0건으로 조용히 통과할 수 있었다. Linux CI 는 미측정이다(S1-6 몫).
- **수정 포인트**: 새 글롭을 추가할 때 결과를 같은 방식으로 정규화한다.

### scripts/check-purity.test.ts — 시험 변경 (71 → 87개, 전체 `bun test` 106 → 122)
- **한 줄 해설**: 기대를 뒤집은 3개(가 부류, 정규식이 틀렸던 것 — DV-008 에 기록), 입력만 교정한 1개(`"new Date("` 는 구문 오류라 `"new Date(\n\tvalue\n);"` 로 교정, 판단 보류 (c)), 새 시험(6종 양성·줄 번호 6·파싱 3·B9 보조 3). 규모 시험 3개는 삭제했다 — 이 파일은 이제 `performance`·실시계를 쓰지 않아 L2 가 성립한다(D-3·H-3 소멸). Biome 33개 입력은 회귀용으로 유지했다.

## 이번 런에서 같이 바뀐 문서
- `docs/design/01-repository-structure.md`: B9 칸을 AST 서술로 바꾸고 B2 한계 추가, "표현할 수 없다"·D-2 의 "확정" 문구 제거.
- `docs/domains/tech-stack.md:105`: "ADR-050 의 실측 표기"를 `참고값(재현 불가)` + 커밋된 근거로 교체(D-1).
- `docs/design/02-dev-environment.md` §3: `@swc/core` 로드(Windows) 행 추가 — `SWC_NATIVE_BINDING_CACHE` 가 전제이고 의존 버전은 1.16.22 유지(Q2). 경로 값은 호스트마다 달라 문서에는 조건만 적었다(판단 보류 (d)).
- `docs/deviation-log.md`: DV-008 신설. `docs/domains/tech-debt.md`: TD-1·2·3 닫힘 표기, `닫힌 항목` 3행. `11-implementation-plan.md` 에 S1-5b 가칭 행을 넣어 S1-6 행이 95행이 되었고 `tech-debt.md` 의 줄 참조 두 곳도 95로 고쳤다.
- `.dependency-cruiser.cjs`: 주석만(`:3-9`·`:161`).

## 바뀐 과정에서 배울 것
- 계획·구현·리뷰 모두 리비전은 1개씩이다(재실행 없음). 대신 구현 중 계획과 달라진 것이 있다.
- 계획은 앞붙임 기준 오프셋·재귀 순회를 가정했으나, 구현은 셰뱅 파일 실패 때문에 뒷붙임 표지를, 스택 오버플로를 피하려 명시 스택을 골랐다. 시그니처와 판정은 불변이라 리뷰가 이탈로 보지 않았다.
- 계획은 swc 1.15.3 에서 span 누적을 실측했으나 1.16.22 에서는 재현되지 않았다. 보정 가드의 실패 증명은 1.15.3 을 스크래치패드에 따로 설치해 수행했다. 이 한계가 리뷰 m-1 이다.
- 체크포인트 B 에서 사용자가 🟢 통과 후 "그대로 진행"을 골라 m-1·m-2·판단 보류 (a)(c)(d)는 고치지 않고 남겼다. 중간에 레이트 리밋으로 구현이 한 번 끊겼다 재개됐다.

## "이제 혼자 수정하려면"
| 바꾸려는 것 | 어디를 보나 | 주의 |
|---|---|---|
| 새 purity 규칙·탐지 추가 | `check-purity.ts` 의 판정 함수 + `RULES`(:338) | 규칙 ID 는 `PURITY_RULE_IDS` 가 `RULES` 에서 파생. 시험은 `check-purity.test.ts` 에 양성·음성 쌍으로 |
| 래퍼 투명 범위(`as`·`!`) | `WRAPPER_FIELD`(:69) | 지우면 단언 뒤 접근 미탐 |
| `execute` 과탐 조정 | `startsWithRawText`(:274)·`leftChild`(:259) | 시험 `execute 인자 안에서 sql 뒤에서 나뉜 raw 체인` 이 체인 검출을 고정 |
| 줄 번호가 어긋남 | `parseWithLines`(:414)·`base`(:433)·`lineStarts`(:379) | 바이트 기준. 한글·이모지·CRLF·BOM·셰뱅 시험 묶음을 먼저 돌린다 |
| swc 버전 변경 | `package.json` 의 `@swc/core` | 누적 동작이 생기면 m-1 가드를 1.15.3 에서처럼 재증명 |
| Windows 에서 `@swc/core` 로드 실패 | 환경변수 `SWC_NATIVE_BINDING_CACHE`(본인 소유·타 사용자가 교체 못 하는 절대 경로), 문서는 `02-dev-environment.md` §3 | 이 호스트는 저장소 밖 `D:\leejaewoo_projects\.swc-cache` 를 썼다 |
| 경로 구분자 문제 재발 | `arch.ts` 의 `enumerateSources`·`readDeclarations` | `/` 로 통일 |
| `S1-5b` 이름 확정·해시 기입 | `11-implementation-plan.md` S1-5b 행, `tech-debt.md` `닫힌 항목` 표, `deviation-log.md` DV-008 | 커밋 후 "S1-5b 커밋(해시는 커밋 후 기입)" 칸을 실제 해시로 바꾼다 |

## 남은 질문
- 사용자 확인이 남은 것: `S1-5b` 이름, 과탐 (m-2), 래퍼 투명 범위 (a), `SWC_NATIVE_BINDING_CACHE` 문서 문구 (d).
- 미측정: 리눅스 CI 에서의 swc 로드·경로, 구문 오류 소스의 `arch` 종료 코드, 깊은 중첩 식의 순회.
- TD-4(CI 부재)·TD-5(`.env` 자동 로드)·TD-6 은 어느 작업 전에 닫을지 — `tech-debt.md` 한눈표 참조.

---

## 커밋 메시지 (복사해서 바로 사용 가능)
> 기존 커밋 컨벤션을 따름 (`git log` 확인 결과: 한국어, `feat:` 접두사, 본문 개조식 혼용). CLAUDE.md §3 에 따라 AI 작성 커밋은 `Authorship` 트레일러를 둔다 — 사람이 읽고 수정했다면 `A`, 검토만 했다면 `G` 로 맞춘다.

```
feat: check-purity 를 swc AST 로 교체하고 기술부채 TD-1·2·3 을 닫는다 (S1-5b 가칭)

- scripts/check-purity.ts: 정규식 11개를 swc AST 단일 순회로 교체. scanPurity·PURITY_RULE_IDS·{rule, from, line} 공개 표면은 불변
- 줄 번호는 UTF-8 바이트 기준 줄 표와 뒷붙임 표지(`\n;;`) 기준 오프셋으로 계산
- 정규식이 놓치던 표기 6종(sql<number>, execute<Row>, execute?.(, crypto?.randomUUID(), performance?.now(), new globalThis.Date)과 process 를 감싼 접근(as, !, 괄호, ?.)을 검출
- scripts/check-purity.test.ts: 기대를 뒤집은 시험·새 시험 추가(71 → 87), 규모 시험 3개 삭제
- scripts/arch.ts: 글롭 결과의 `\` 를 `/` 로 정규화해 Windows 의 GUARD-uncruised 오탐과 purity 조용한 통과를 제거
- 문서: TD-2 정정(01·tech-stack·.dependency-cruiser 주석), 02-dev-environment 에 SWC_NATIVE_BINDING_CACHE 전제 추가, DV-008 신설, tech-debt TD-1·2·3 닫힘, 11 에 S1-5b 가칭 행 추가
- 왜: 정규식 검사는 리뷰마다 새 우회 표기가 나왔고(KB #9), 제품 코드가 0줄인 지금이 교체 비용이 가장 낮음
- 알려진 한계: 오프셋 보정 가드는 swc 1.16.22 에서 공회전(1.15.3 에서만 실패 증명), execute 첫 인자 검사는 과탐 쪽, 리눅스 CI 미측정
- 검증: bun test 122 통과/0 실패, bun run check 종료 0, bun run arch 종료 0 (SWC_NATIVE_BINDING_CACHE 설정 하, Windows)

Authorship: A
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
