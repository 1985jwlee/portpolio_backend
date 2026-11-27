# 기술부채

이 저장소가 **알면서 미룬 것**의 정본. 무엇을 왜 미뤘고, 언제까지 누가 어떻게 닫는지를 항목마다 적는다.
**작업 계획을 세우기 전, `check-purity`·`arch` 를 건드리기 전, S1-6·S2-1 을 시작하기 전에** 펼친다.
첫 기록은 S1-5(경계 규칙) 런의 6단계 교육 문서 [`## 기술부채`](../teaching/s1-5-boundary-rules-20261116-1724.md) 절에서 옮겨 정리했다. 상세한 코드 위치·시험 목록은 그 절이 원천이다. TD-7 은 S1-2(kernel) 런의 영향분석 인계(H-2~H-8)와 6단계 교육 문서 [`## 한계와 확인하지 못한 것`](../teaching/s1-2-kernel-20261117-1532.md)에서 옮겨 정리했다.

## 기록 규칙

- **항목을 지우지 않는다.** 닫을 때는 아래 [닫힌 항목](#닫힌-항목) 표로 옮기고 **상태·날짜·닫은 커밋**을 적는다. 번호(TD-n)는 재사용하지 않는다.
- 새 항목은 **무엇 / 왜 지금 안 했나 / 언제까지 / 누가 / 닫는 방법 / 완료 판정** 여섯 칸을 채운다. **누가** 는 `docs/design/11-implementation-plan.md` 의 작업 ID 이고, 행이 없으면 "미배정" 이다 — 임의 ID 를 만들지 않는다.
- 수치는 [ADR-050](../adr/ADR-050-evidence-rule.md) 을 따른다. 스크립트·원시 결과가 저장소에 없는 수치는 **"이번 런 실측(근거: gitignore 된 `.pipeline-dev/` 산출물, 저장소에 없음)"** 으로 한계를 표기했고, 재지 않은 것은 **미측정** 으로 썼다.

## 한눈표

| ID | 한 줄 요약 | 담당 작업 | 기한 | 상태 | 가장 큰 위험 |
|---|---|---|---|---|---|
| **TD-1** (P1) | `check-purity` 를 정규식에서 swc AST 로 교체 (사용자 결정 (A)) | **S1-5b** (가칭 — 이름 확정은 사용자 몫, `11` 에 행 추가) | **S2-1 이전** | **닫힘 2026-11-17** | Drizzle `` sql<number>`…` `` 등이 규칙을 그대로 피해 첫 제품 모듈에서 조용히 통과 |
| TD-2 | 영향분석이 찾은 문서·주석 어긋남 D-1~D-4 | S1-5b (TD-1 과 같은 작업) | TD-1 의 재계획과 함께 | **닫힘 2026-11-17** | D-1·D-2 가 근거 없는 "실측"·"확정" 문구로 남아 다시 열 이유를 지움 |
| TD-3 | 리뷰 r4 잔여 m-1~m-3 | S1-5b (TD-1 과 같은 작업) | m-2 는 S2-1 이전, m-3 는 Biome 올리기 전 | **닫힘 2026-11-17** (소멸) | Biome 를 올려도 깨지는 가드가 없다 |
| TD-4 | S1-6 이 넘겨받는 CI 사실 H-1~H-6 | **S1-6** | S1-6 계획의 입력으로 | **배선됨 — CI 첫 실행 확인 대기** | CI 에서 의도적 위반 PR 이 `arch` 를 빨강으로 만들지 못함 (H-4) |
| TD-5 | `bun test` 가 `.env` 를 자동으로 읽음 | S1-3 | `.env` 값에 기대는 첫 시험 전 | **닫힘 2026-11-18** | 문서에는 없고 KB 에만 있는 사실 |
| TD-6 | 계획이 이미 이월한 범위 (B3·B14 등) | S2-1·S1-18·첫 제품 패키지 | 각 담당 작업 | 담당이 문서에 있음 | `port-kinds.json` 형식이 실제 모듈 없이 정해져 바뀔 수 있음 |
| **TD-7** | S1-2(kernel) 가 남긴 것 — 실구현체 미배정(7-1), 직렬화·표 한계, 문서 대조 자동화 없음 | 항목마다 다름 (S1-6·S1-18·S2-1·CM-03·**미배정 1건**; 7-3 은 S1-3, 7-2·7-11 은 2026-11-18, 7-1 과 7-5 의 S1-11 몫은 2026-11-26 에 닫힘) | 각 담당 작업 시작 전 | 열림 | 추출 게이트(S1-18)가 판별을 `kind` 위에 세우면 운영에서 모든 도메인 오류가 500 으로 나감 (7-5 의 계약 DTO 몫) |
| **TD-8** | S1-4(`packages/db`) 가 남긴 것 — UoW 재시도·지표, `assertUpToDate`, 풀 통계·종료 기한, `roles.json` 의 시퀀스·함수 권한, drizzle-kit 저널 형식 ↔ Biome 충돌, 잠금 대기 상한, 관리 역할 폐기 시 권한 잔존, 관리 역할 선행 조건(8-8)·로컬 `.env` 키 불일치(8-9) | 항목마다 다름 (8-3·8-9 는 2026-11-26 S1-7 에서 닫힘, 8-8 은 배선됨 — 사람 확인 대기, 8-5 는 S2-1, **나머지 미배정**) | 각 담당 작업 시작 전 | 열림 | `retryOnSerialization` 이 없어 직렬화 실패(40001·40P01)가 호출자마다 제각각으로 처리됨 (8-1) |
| **TD-9** | S1-8(`PostgresEventTransport`)이 남긴 것 — 통합 시험의 inbox 표가 시험 전용 DDL 이라 실제 inbox 와 어긋날 수 있음 | **S3-4** | S3-4 가 inbox 마이그레이션을 만들 때 | 열림 | 실제 inbox 의 열·제약이 바뀌어도 이 시험은 그대로 초록이라 전달 어댑터와 실제 표의 계약이 검증되지 않음 |

---

## TD-1 (P1) — `check-purity` 를 swc AST 로 교체

> **닫힘 (2026-11-17, S1-5b 가칭)** — 완료 판정 (a)~(e) 충족, 상세는 [닫힌 항목](#닫힌-항목)·[`deviation-log.md`](../deviation-log.md) DV-008. 아래는 닫기 전 기록이며 지우지 않는다.

**가장 중요한 항목이다.** 사용자가 S1-5 런의 체크포인트 C 에서 방향을 **(A) check-purity 내부를 swc AST 로 바꾼다** 로 확정했고, 같은 체크포인트에서 "6단계로 넘어가면서 기술부채 항목으로 자세하게 작성한다" 를 골라 이번 런에서는 구현하지 않았다(계획 재수정·코드 재조정 없음).

| 칸 | 내용 |
|---|---|
| **무엇** | `scripts/check-purity.ts` 의 판정 엔진(규칙 4개의 정규식 11개)을 `@swc/core`(이미 devDependency 1.16.22)의 `parseSync` AST 순회로 바꾼다. 5단계가 AST 로 구조가 드러남을 실측한 표기는 여섯이다 — `process⏎.env`, `crypto?.randomUUID()`, `` sql<number>`…` ``, `new globalThis.Date`, `Date /* c */ .now()`, `db.execute<Row>(…)`. |
| **왜 지금 안 했나** | 5단계가 계획 결정 9 를 반증했으나 사용자가 방향만 (A) 로 확정하고 재계획·재작성을 요청하지 않았다. 이 런의 완료 기준(Q2 (A): 로컬 `arch` 가 위반 샘플에서 실패)은 이미 충족됐다. (A) 가 기존 시험 71개와 B11-write 를 다 감당하는지는 표기 몇 개만 탐침했고 **미측정**이다. |
| **언제까지** | **S2-1 이전.** S2-1 은 첫 제품 모듈이라 이 검사가 처음 실제 코드를 만난다. [ADR-025](../adr/ADR-025-query-layer.md) 가 `check-purity` 에 "`raw/` 밖 `sql` 템플릿 검출" 을 맡겼는데 Drizzle 의 타입 지정 형태 `` sql<number>`…` `` 가 그것을 피한다. 지금은 실저장소 purity 대상이 0개라 교체 중 흔들릴 실코드가 없다. |
| **누가** | **미배정.** `docs/design/11-implementation-plan.md` 에 행이 없다. 사용자가 새 행(가칭 `S1-5b`)을 더하거나 S1-6 앞에 끼울지 정한다. 파이프라인으로 돌리면 2단계(계획)부터 시작한다. |
| **닫는 방법** | ① **탐침 먼저**: 시그니처(`scanPurity(path, text): ArchViolation[]`)·`PURITY_RULE_IDS`·위반 모양 `{rule, from, line}` 을 그대로 두고 AST 구현 골격에 기존 시험 71개를 돌려 몇 개가 빨강인지 센다. ② 빨강을 세 부류로 가른다(아래). ③ 규칙별로 AST 판정을 채운다. ④ 문서(`01-repository-structure.md` §5 의 B2·B9·B11 칸·"검사하지 않는 것" ⑤·221행·476행, DV-008, 계획 결정 9·가정 A-6·원장 D10)를 다시 쓴다. 호출부는 `arch.ts:272` 하나라 불변이다. |
| **완료 판정** | (a) `bun test` 전체 초록이고 기대를 뒤집은 시험의 목록이 DV-008 에 적혀 있다. (b) m-2 표기 6종(`sql<number>`·`.execute<Row>(`·`.execute?.(`·`crypto?.`·`performance?.`·괄호 없는 `new globalThis.Date`)이 새 양성 시험으로 있고 **고치기 전 코드에서 빨강**이다(회귀 가드 규약). (c) `bun run check`·`bun run arch` 종료 0. (d) `rg "표현할 수 없다" docs/design/01-repository-structure.md` 가 0건. (e) `check-purity.ts` 에 위반 판정용 `patterns` 가 없다. |

### 지금 정규식이 남기는 우회

- 포매터 밖 표기: `` sql<number>`…` ``, `.execute<Row>(`, `.execute?.(`, `crypto?.`, `performance?.`, 괄호 없는 `new globalThis.Date`.
- 토큰 사이 주석(`new Date(/* now */)`), 구조분해 안 문자열·주석의 짝 안 맞는 중괄호, 중괄호 네 겹 이상, 따옴표·계산식 키, 타입 주석(`check-purity.test.ts:119`·`:752-770` 이 고정).
- 엔진 한도: 구조분해 하나가 약 350KB 를 넘으면 조용한 미탐(`check-purity.ts:49`).
- 결합: 정확성이 Biome 2.6.8 출력에 묶여 있고 올릴 때 깨지는 가드가 없다.
- **AST 로도 안 사라지는 것**: 이름공간·기본 임포트의 `b.env`, 별칭 `const p = process`, `require("bun")`. 스코프·데이터 흐름 추적 없이는 구조만으로 못 잡는다. (A) 가 이것까지 닫는다고 쓰지 않는다.

### 기존 시험 71개를 수용 기준으로 쓰는 법

- **가. 미탐을 단언하던 시험은 빨강이 되는 것이 개선이다.** `:119`(주석·타입 주석·따옴표 키)·`:753`(토큰 사이 주석)·`:762`(짝 안 맞는 중괄호·네 겹)와 오탐을 단언하는 `:133-137`(`job.process?.()`)이 해당한다. 기대를 뒤집고 01 §5 의 한계 문장을 지운다.
- **나. 의미가 바뀌는 것 — 주석·문자열.** 지금 규칙은 주석·문자열 안도 위반으로 센다(`check-purity.ts:13`, 계획 가정 A-6). AST 는 주석·문자열 속 `process.env` 를 코드로 보지 않는다. 설명 주석의 `process.env` 오탐이 사라지는 것이 이점이다. 위험은 "문자열 속 표기" 를 위반으로 기대하던 시험이 있는지인데, 큰따옴표·백틱 문자열 안에서 `//`·`/*` 를 포함한 작성자 입력은 위 네 줄뿐임을 grep 으로 확인했다(**작은따옴표 입력은 전수 확인 못 함**). 쓰기 `execute` 의 문자열 인자는 AST 에서 StringLiteral 노드로 본다.
- **다. 진짜 회귀.** 가·나 어디에도 속하지 않는 빨강은 구현 결함이다.
- **줄 번호와 오프셋 단위**: swc 위치를 줄 번호로 바꾸는 방법과, 한글 주석이 섞인 파일에서 오프셋이 UTF-16 인지 바이트인지는 **확인하지 못했다.** 탐침 항목에 넣는다. 시험은 "매치가 시작한 줄" 로 보고하고 한 줄 같은 규칙은 한 건이다.

### 규모 시험 3개와 Biome 출력 고정 시험 33개의 운명 (제안 — 결정은 사용자)

- **규모 3개(`:802-826`)**: 이차 복잡도를 막는 시험이다. AST 에서는 이유가 약해진다. 삭제하거나 대형 입력 1개짜리 smoke 로 줄인다. 삭제하면 L3 시험이 L2 파일에서 빠져 TD-2 의 D-3 과 TD-4 의 H-3 이 함께 사라진다.
- **Biome 33개(`:325-713`)**: AST 는 줄바꿈과 무관하게 같은 노드를 보므로 "포매터 결합을 지킨다" 는 목적이 사라진다. 비용이 0 이라 **회귀 입력**으로 남기고 묶음 이름을 "Biome 2.6.8 고정" 에서 바꾸는 쪽을 권한다. 이 33개가 AST 에서 통과하는지가 수용 기준의 일부다.
- 열거 생성기(TD-3 의 m-3)는 AST 로 가면 반입할 이유가 없어진다.

### 대안과 장단

| 안 | 장점 | 단점·미측정 |
|---|---|---|
| **(A) swc AST (선택됨)** | `arch` 구조·Q2(A) 유지. 포매터 결합·엔진 한도·⑤ 가 구조적으로 사라진다. m-1~m-3 도 함께 소멸. 도구는 이미 설치돼 있다 | 주석·문자열 의미가 바뀐다. 별칭·`require` 는 여전히 못 잡는다. 71개를 다 감당하는지 **미측정** |
| (B) Biome GritQL + `noProcessEnv` | 포매터와 같은 파서라 결합이 0. 5단계 실측: GritQL 이 `Date⏎.now()`·`Date /* c */ .now()` 를 잡고 `overrides[].plugins` 로 `domain/` 만 걸 수 있음. `noProcessEnv` 가 `process⏎.env`·`globalThis.process.env`·`process["env"]` 를 잡음 | 위반이 `lint`/`check` 로 들어가 Q2(A)·Q4(A) 의 "arch 는 check 에 편입 안 함" 과 부딪힌다 — 재결정 필요. 비공허성 가드와 T1 위반 집합을 Biome 출력 기준으로 옮겨야 한다. 구조분해(`{ env } = process`)는 `noProcessEnv` 가 못 잡아 보조 패턴 필요. `.insert(` 를 Grit 로 옮기는 비용·플러그인 문법의 Biome 버전 안정성은 **미측정** |
| (C) 정규식 유지(최소안) | 코드 변경 없음, 사용자 결정과 충돌 없음. m-2 는 정규식 3곳+시험 6개로 닫힌다(리뷰 r4 추정, 정규식은 미검증 제안) | 구조적 미탐이 남고 네 사이클 연속 우회가 났다. Biome 올림 가드가 필요하다. 사용자가 (A) 를 골랐으므로 (A) 전의 임시 안전판으로만 의미가 있다 |

어느 안이든 D-2(01 의 "확정" 문구) 정정은 필요하다.

**근거**: [교육 문서 TD-1](../teaching/s1-5-boundary-rules-20261116-1724.md) · 사용자 결정은 S1-5 런 `ANSWERS.md` 의 체크포인트 C(gitignore 대상 `.pipeline-dev/` 에만 있음, 저장소에 없음) · 편차 DV-008 은 [`../deviation-log.md`](../deviation-log.md).

---

## TD-2 — 영향분석이 찾은 문서·주석 어긋남 D-1~D-4

> **닫힘 (2026-11-17, S1-5b 가칭)** — D-1(a)·D-2·D-4 는 문구를 고쳤고 D-3 은 규모 시험 삭제로 소멸했다. 아래는 닫기 전 기록이며 지우지 않는다.

| 칸 | 내용 |
|---|---|
| **왜 지금 안 했나** | 사용자가 코드·문서 재조정 없이 6단계를 골랐다. |
| **언제까지** | TD-1 의 재계획 사이클과 함께. D-2 는 어느 안이든 필수. D-3 은 S1-6 계획이 TD-4 의 H-3 과 함께 정해도 된다. |
| **누가** | TD-1 과 같은 **미배정** 작업. |

| # | 위치 | 어긋난 것 | 닫는 방법 | 완료 판정 |
|---|---|---|---|---|
| D-1 | [`tech-stack.md`](tech-stack.md) 105행 "ADR-050 의 실측 표기", DV-003 | ADR-050 은 실측을 "스크립트 + 원시 결과 + 호스트 사양 + 커밋 해시가 커밋된 것" 으로 정의한다(`ADR-050-evidence-rule.md:17`). "1단계 재현" 은 gitignore 대상 `.pipeline-dev/` 에만 있다. T8 이 가용성 단언으로 바뀌며 증거 사슬이 끊겼다 | (a, 현실적) 수치를 `참고값(재현 불가)` 로 낮추고 근거를 "`depcruise --info` 의 지원 범위 + T8" 로 다시 적는다. (b) 재현 스크립트를 `spikes/` 규약(ADR-050 27행)으로 커밋. DV-003 은 지우지 않는 규칙이라 DV-008 에서 참조 정정 | 105행에 "ADR-050 의 실측 표기" 가 없고 근거가 커밋된 파일을 가리킨다 |
| D-2 | `docs/design/01-repository-structure.md:221`·`:476` | "Biome 로는 표현할 수 없다"·"확인(S1-5): 표현할 수 없다 → `check-purity.ts` 로 확정". 확인한 것은 `noRestrictedGlobals` 하나뿐이다. 원래 "미확인" 이던 항목을 '확정' 으로 닫아 다시 열 이유를 지웠다 | "내장 규칙으로는 속성 단위 금지가 없다(`noRestrictedGlobals` 확인). GritQL·`noProcessEnv` 는 S1-5 에서 평가하지 않았다" 로 낮추고 메커니즘은 TD-1 이 정한다 | 두 줄에 "표현할 수 없다"·"확정" 이 없다 |
| D-3 | `docs/design/08-test-strategy.md:44` | 등급 칸이 L2·L2(조건부)뿐인데 규모 시험 3개(`check-purity.test.ts:804` 이하)는 실시계를 읽는다. 같은 문서 10행 원칙상 L3 | 행에 "규모 시험 3개는 실시간 시계 → L3" 를 덧붙인다. **TD-1 이 규모 시험을 지우면 소멸하므로 TD-1 결정 뒤에 한다** (→ 2026-11-17 S1-5b 가 규모 시험 3개를 삭제해 소멸) | 44행이 실제 시험 등급과 맞거나 규모 시험이 없다 |
| D-4 | `.dependency-cruiser.cjs:6-8` | 주석이 "기본 파서가 .ts 를 한 건도 못 읽는다 … 카나리가 잰다" 로 적혀 있다. 실측은 `@swc/core` 가 있으면 어느 parser 값이든 같은 결과이고 카나리는 가용성을 잰다 | "`@swc/core` 가 있어야 `.ts` 를 읽는다(없으면 0건). `parser` 고정은 typescript 트랜스파일러가 되살아날 때 파서가 조용히 바뀌지 않게 하려는 것" 으로 | 주석이 DV-003·T8 과 같은 말을 한다 |

**근거**: [교육 문서 TD-2](../teaching/s1-5-boundary-rules-20261116-1724.md) · 5단계 영향분석 산출물(gitignore, 저장소에 없음).

---

## TD-3 — 리뷰 r4 잔여 m-1~m-3

> **닫힘 (2026-11-17, S1-5b 가칭) — 소멸 확인** — TD-1 (A) 로 m-1(구조분해 엔진 한도)·m-2(6종 양성 시험)·m-3(열거 생성기 불필요) 가 모두 사라졌다. 아래는 닫기 전 기록이며 지우지 않는다.

| 칸 | 내용 |
|---|---|
| **왜 지금 안 했나** | 리뷰 r4 가 통과 가능 판정을 냈고 사용자가 체크포인트 B 에서 "그대로 진행" 을 골랐다(잔여 m-1·m-2·m-3 은 닫지 않고 기록). |
| **누가** | TD-1 과 같은 **미배정** 작업. 없으면 01 §5 를 다음에 고치는 사람. |

| # | 무엇 | 언제까지 | 닫는 방법 | 완료 판정 |
|---|---|---|---|---|
| m-1 | 구조분해 갈래의 엔진 한도(약 350KB 초과 시 조용한 미탐)가 코드 주석(`check-purity.ts:49`)에만 있고 01 §5 B9 칸에 없다 | 01 §5 를 다음에 고칠 때. **TD-1 이 B9 칸을 다시 쓰면 소멸** | 문서 한 구절 | 01 §5 B9 칸에 한도 문장이 있거나, AST 기준으로 칸이 다시 쓰여 구조분해 갈래 서술이 없다 |
| m-2 | 포매터 밖 표기 6종 미탐(TD-1). 첫 제품 모듈(S2-1)의 Drizzle 관례에서 `sql<number>` 가 얼마나 흔한지는 저장소 안에 근거가 없다(설계 문서에 `sql<` 0건) | **S2-1 이전** | (A) 면 TD-1 로 소멸. (C) 면 정규식 3곳 + 시험 6개(리뷰 r4 추정, 정규식은 미검증 제안) | 6종 각각 양성 시험이 있고 고치기 전 빨강 |
| m-3 | 열거 생성기(스크래치 `gen/gen.ts`, 53,930건)가 저장소 밖·비영속이다. Biome 를 올린 뒤 다시 열거할 수단이 없다. **Biome 정확 고정(`package.json` 의 2.6.8)과 묶어야 의미가 있다** | Biome 를 올리기 전 | (A) 면 불필요. (C) 면 생성기를 저장소에 반입(파일 1개 + 문서 1줄)하고 Biome 버전 변경 시 재실행을 문서·시험으로 강제 | 생성기가 저장소에 있고 "Biome 올림 → 재열거" 절차가 문서에 있거나, TD-1 로 이 필요가 사라졌다 |

> m-3 의 53,930건은 이번 런의 저장소 밖 스크래치 산출물 수치다(ADR-050 기준 근거 없음 — 참고값).

**근거**: [교육 문서 TD-3](../teaching/s1-5-boundary-rules-20261116-1724.md) · 리뷰 r4(gitignore, 저장소에 없음).

---

## TD-4 — S1-6(CI 배선)이 넘겨받는 것 H-1~H-6

| 칸 | 내용 |
|---|---|
| **왜 지금 안 했나** | Q2(A) 로 배선은 S1-6 몫이고, 넘기면서 함께 가야 할 사실이다(계획 결함 아님). |
| **언제까지** | S1-6 계획의 입력으로. |
| **누가** | **S1-6** (`docs/design/11-implementation-plan.md` 95행). 11 의 S1-6 행에 반영했다(S1-6, 2026-11-25). |

| # | 사실(5단계 실측 — 근거는 이번 런 산출물, 저장소에 없음) | 닫는 방법 | 완료 판정 |
|---|---|---|---|
| H-1 | dependency-cruiser engines `^22\|\|^24\|\|>=26` ↔ 호스트 node 25.1.0. CLI 를 부르면 `ERROR: Your node version (25.1.0) is not supported`·종료 1. `arch` 는 Bun 이 API 로 부르므로 무관. 러너 node 버전은 확인할 수 없다 | `depcruise` CLI 단계(`depcruise-fmt`·`bunx depcruise` 등)를 두지 않는다. 꼭 두면 setup-node 로 22 또는 24 고정 | CI `arch` 잡이 `bun scripts/arch.ts` 로만 돌고 로그에 `Your node version` 이 없다 |
| H-2 | `@swc/core` postinstall 이 Bun 에서 차단(`bun pm untrusted`)되나 해는 없다 — 바이너리는 optionalDependencies 로 오고 `bun.lock` 에 플랫폼별 13항목(`bun.lock:55`). `node_modules` **캐시 키**에 os·arch·libc 가 빠지면 다른 플랫폼 바이너리가 복원되어 cruise 가 0 모듈로 끝나고 `GUARD-uncruised` 가 파일마다 빨강을 낸다(조용한 통과는 아니나 원인을 잘못 짚기 쉽다). `09` 50행에는 '캐시' 만 있고 키가 없다. `trustedDependencies` 등록 시 node 없는 이미지의 동작은 **미측정** | 신뢰 등록 안 함([`tech-stack.md`](tech-stack.md) 105행 결정 유지). 캐시 키에 `runner.os`·`runner.arch`·`bun.lock` 해시. `GUARD-uncruised` 가 줄줄이 뜨면 T8 부터 본다 | 캐시 키에 세 요소가 있고 T8 이 CI 에서 초록 |
| H-3 | 규모 시험 3개(`LIMIT_MS = 2000`): 부하 없음 12~13 / 40~47 / 123~143 ms. CPU 한 개에 12개를 겹치면(`taskset -c 0`) 247~334 / 423~525 / 1,350~1,505 ms, 가장 무거운 `importEnv80k` 의 여유가 약 1.3배(12회 통과). `09` 55행 `unit test` 잡이 `bun test` 를 매 PR 에 돌린다. 실제 러너는 **미측정** | ① 상대 비교(n 과 2n 의 시간비)로 바꾼다 ② 별도 잡으로 떼어 매 PR 에서 뺀다 ③ 상한을 올린다(가드 감도 7~12초가 줄어듦). **`retry` 로 덮지 않는다.** TD-1 이 규모 시험을 지우면 소멸 (→ 2026-11-17 S1-5b 가 규모 시험 3개를 삭제해 "시험이 없다" 를 충족 — S1-6 은 이 행을 확인만 한다) | 매 PR 게이트에서 시계 시험이 흔들리지 않거나 시험이 없다 |
| H-4 | 픽스처를 고쳐서는 CI `arch` 를 빨강으로 만들 수 없다. 설정이 `^scripts/fixtures/` 를 제외하고 실저장소는 열거 7·purity 대상 0·cqrs 모듈 0 이기 때문이다. 빨강은 `bun test` 쪽에서만 난다. S1-6 완료 기준 "의도적 위반 PR 에서 빨강"(`11:95`)에 영향 | 위반 PR 이 `(apps\|modules\|packages)/<x>/src/` 아래에 파일을 하나 넣게 설계한다 | 그 PR 에서 `arch` 잡이 빨강이다 |
| H-5 | (S1-4 가 더함) `migration immutable`(`bun run migration:immutable`)은 `merge-base(기준, HEAD)` 를 쓴다. CI 의 얕은 checkout(`fetch-depth: 1`)이면 merge-base 가 나오지 않아 검사가 던지고(종료 1), `--base` 의 기본값 `main` 은 PR 대상이 다른 브랜치일 때 틀린다 | 잡이 `--base <PR 대상 브랜치>` 를 주고, checkout 은 전체 이력(`fetch-depth: 0`)으로 한다 | 마이그레이션을 고친 PR 에서 그 잡이 빨강이고, 마이그레이션이 없는 PR 에서 `변경 0` 으로 초록이다 |
| H-6 | (S1-4 가 더함) `test:integration` 은 환경변수 `TEST_DATABASE_URL`(슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터)이 없으면 **건너뛰지 않고 실패한다.** CI 잡이 그 값을 공급해야 한다 — 서비스 컨테이너의 `postgres` 슈퍼유저 URL 이면 된다(역할 `pf_*` 는 시험이 없을 때만 만들고 지우지 않는다) | `integration` 잡에 서비스 컨테이너 `postgres:18` 과 `TEST_DATABASE_URL` 을 둔다. 래퍼가 컨테이너를 띄우는 방식(G9)을 고르더라도 시험에는 URL 하나만 넘긴다 | CI 의 `integration` 잡이 `packages/db` 통합 시험 4개를 돌려 초록이다 |

### S1-6 처리 결과 (2026-11-25 — 워크플로 배선됨, **CI 러너 실행은 아직 없다**)

> 상태는 `배선됨 — CI 첫 실행 확인 대기` 다. 위 H-1~H-6 의 완료 판정이 전부 "CI 에서" 라 첫 실행 전에는 닫지 않는다. 아래 "로컬 재현" 은 같은 명령을 호스트에서 돌린 것이라 러너의 설치·캐시·서비스 컨테이너 네트워킹은 증명하지 못한다(L4 는 사람, 불가 선언 근거는 S1-6 런 산출물).

| # | 무엇으로 닫았나 (`.github/workflows/ci.yml` · `.github/actions/setup-bun/action.yml`) | 로컬 재현 | 남은 확인 = 첫 CI 실행 |
|---|---|---|---|
| H-1 | `arch` 잡은 `bun run arch` 한 단계뿐이다. `depcruise` CLI·`bunx depcruise`·setup-node 단계가 없다 | `bun run arch` 종료 0(위반 0) | `arch` 로그에 `Your node version` 이 없다 |
| H-2 | `setup-bun` 캐시 키 = `bun-` + `runner.os` + `runner.arch` + `hashFiles('bun.lock')`, `trustedDependencies` 등록 안 함. **캐시 대상은 `~/.bun/install/cache` 이고 `node_modules` 가 아니다**(사용자 확인 Q2 — 설치가 매번 lock 을 대조한다) | 해당 없음 | 키 문자열에 세 요소가 보이고, `unit` 잡의 T8(`scripts/arch.test.ts`)이 초록 |
| H-3 | 규모 시험이 없다(`grep -rn LIMIT_MS scripts packages --include=*.ts` 0건). `unit` 잡에 재시도 옵션이 없다 | `bun test` 333 pass | 없음(확인만 하는 행) |
| H-4 | 위반 재현 절차를 로컬로 갈음했다(DV-018): `packages/kernel/src/` 에 `node:fs` 임포트 파일을 두면 `bun run arch` 가 `B7-kernel` 로 종료 1, 지우면 0 | 종료 1 → 0 | (선택) 위반 PR 에서 `arch` 잡 빨강 |
| H-5 | `migration-immutable` 잡이 `fetch-depth: 0` 으로 받고 `--base "origin/$BASE_REF"` 를 준다(`pull_request` 에서만) | `--base origin/dev`·`origin/main` 모두 `변경 0 · 위반 0` | 마이그레이션이 없는 PR 에서 `변경 0` 초록 (고친 PR 의 빨강은 `scripts/check-migration-immutable.test.ts` 가 임시 저장소로 증명하고 `unit` 잡이 돌린다) |
| H-6 | `integration` 잡의 서비스 컨테이너 `postgres:18` + 잡 환경변수 `TEST_DATABASE_URL` | 로컬 `postgres:18.6` 컨테이너에서 `bun run test:integration` 4파일 31 pass | 러너에서 같은 4파일이 초록 |

**근거**: [교육 문서 TD-4](../teaching/s1-5-boundary-rules-20261116-1724.md) · [`../design/09-ci-cd.md`](../design/09-ci-cd.md) · [`../design/11-implementation-plan.md`](../design/11-implementation-plan.md).

---

## TD-5 — `bun test` 의 `.env` 자동 로드 (이전 런에서 이어짐)

> **닫힘 (2026-11-18, S1-3)** — 수단은 루트 `bunfig.toml` 최상위 `env = false` 이고, 시험은 `scripts/bunfig-env.test.ts`(D1 대조군: bunfig 없이 `.env` 값이 보임 / D2: 루트 `bunfig.toml` 복사 시 안 보임)다. **부작용: 저장소 루트에서 도는 모든 bun 명령(`bun <파일>`·`bun test`)이 `.env` 를 자동으로 읽지 않는다.** 루트에서 `.env` 를 읽어야 하는 명령 — S1-4 `db:migrate`, S1-7 `dev`·`db:seed`·`worker <cmd>`(02 §2.2 기동 시퀀스 순서) — 은 각자 `--env-file=.env` 로 명시 로드해야 한다(`--env-file` 은 여전히 읽는다. `bun run <스크립트>` 는 bunfig 와 무관하게 스크립트 셸에 `.env` 를 넣지 않는다). S1-6·S1-10 이 이 파일에 `[test] preload` 를 넣으면 D2 가 임시 디렉토리에서 `preload not found` 로 빨개진다 — 그때 D2 를 고치고 지우지 않는다. `bunfig.toml` 은 작업 디렉토리 기준이라 하위 디렉토리에서 돌리면 걸리지 않는다. 아래는 닫기 전 기록이며 지우지 않는다.

| 칸 | 내용 |
|---|---|
| **무엇** | `bun test` 가 `.env` 를 자동으로 읽는다. S1-1 커밋(`bacf2e2`) 메시지가 "알려진 한계" 로 적었다. S1-5 런 1단계 실측(근거: 이번 런 산출물, 저장소에 없음): 차단은 설정 파일 최상위 `env = false` 또는 `--no-env-file` 이 유효하고 `[test]` 표 안은 무효다. |
| **왜 지금 안 했나** | S1-5 런 Q3 에서 사용자가 (B) "문서 미반영, KB 만" 을 확정했다(`design/02` 는 변경하지 않음). 그래서 **이 사실은 문서에 없고 KB 에만 있다.** 단 `02-dev-environment.md:170` 의 변경은 `.gitignore` 의 `!.env.example`(D30)이며 이 항목과 무관하다. |
| **언제까지** | S1-3 (S1-1 커밋 메시지는 S1-2·S1-3 을 지정했으나 S1-2 는 해당 없음 — kernel 시험은 환경을 읽지 않는다, S1-2 계획). 시험이 `.env` 값에 기대기 시작하는 첫 작업 전. |
| **누가** | S1-3 의 담당 계획. 문서 반영은 사용자가 Q3 를 다시 열 때만. |
| **닫는 방법** | `bun test` 를 `--no-env-file` 로 돌리거나 설정 파일 최상위 `env = false` 를 둔다. 어느 쪽을 쓸지와 문서 반영 여부는 그때 정한다. |
| **완료 판정** | `.env` 에 값을 넣고 `bun test` 에서 읽히지 않음을 보이는 시험 1개(제안), 또는 Q3 를 뒤집어 `design/02 §5` 에 사실이 적힘. |

**근거**: [교육 문서 TD-5](../teaching/s1-5-boundary-rules-20261116-1724.md) · 커밋 `bacf2e2`.

---

## TD-6 — 계획이 이미 이월한 범위 (담당이 문서에 있다)

새 부채가 아니라 **이월 목록**이다. 담당이 문서에 있으므로 별도 기한을 만들지 않고 각 담당 작업의 시작 시점을 기한으로 본다.

| 항목 | 담당 | 비고 |
|---|---|---|
| B3 어댑터 스키마 대조 | S2-1 | DV-005, `11` 의 S2-1 행 |
| **(2026-11-27 닫힘 — `scripts/check-migration-isolation.ts` · `bun run check:migration-isolation`, CI `migration-immutable` 잡의 둘째 단계)** B14 SQL 절 | S1-18 | DV-005, `11` 의 S1-18 행 |
| `port-kinds.json`·`cqrs-exceptions.json` 형식 | S2-1 | 실제 모듈 없이 정함 — 계획이 스스로 가장 약한 고리로 적음. 바뀌면 선언·픽스처·`check-cqrs` 가 함께 다시 쓰인다 |
| 실저장소 `@pf/*` 워크스페이스 해석 | S1-3(패키지 간) | S1-2: 자기 참조(`packages/kernel/test` → `@pf/kernel`)가 tsc·`bun test`·`bun run arch` 에서 해석됨 — 실측 배치는 isolated(`node_modules/.bun/` 있음, `node_modules/@pf` 없음). 패키지 간 해석은 kernel 을 의존하는 첫 패키지가 잰다. **S1-3 실저장소 실측(2026-11-18, `packages/config`)**: `"@pf/kernel": "workspace:*"` 선언 있음 — `bun run typecheck`·`bun test packages/config`·`bun run arch` 종료 0, 링크 `packages/config/node_modules/@pf/kernel -> ../../../kernel`. 선언 없음(`dependencies` 를 지우고 `bun install`) — `typecheck` 종료 1(`TS2307`, 그 결과로 `@ts-expect-error` 가 쓸모없어져 `TS2578` 이 따라 난다), `bun test` 는 `Cannot find module '@pf/kernel'`, `arch` 는 `unresolvable packages/config/src/loader.ts → @pf/kernel` 위반으로 종료 1. 선언을 복원하고 `bun install` 을 다시 돌려 `package.json`·`bun.lock` 이 바이트까지 같음을 확인했다 |
| B6 조립 경로 모호점·`GB → ID` 다이어그램 충돌 | S2-1 | 01 §5 "문서 자체의 모호점" 에 적혀 있다. B12 는 범위 밖(제안 단계) |

**근거**: [교육 문서 TD-6](../teaching/s1-5-boundary-rules-20261116-1724.md) · [`../design/11-implementation-plan.md`](../design/11-implementation-plan.md).

---

## TD-7 — S1-2(kernel) 가 남긴 것 (2026-11-17)

S1-2 런이 **알면서 닫지 않은 것**의 모음이다. 코드는 `98ceec8` 로 들어갔고 L2 검증을 통과했으며, 아래는 그 코드가 **다른 작업에 넘기는 대가와 비어 있는 자리**다. 항목마다 담당이 다르므로 한 묶음으로 쓰되 **기한은 각 담당 작업의 시작 시점**이다(TD-6 과 같은 방식). 표의 H-n 은 영향분석 인계 번호(런 산출물, 저장소에 없음)이고 교육 문서 `## 이번에 닫지 않은 것` 에 같은 목록이 있다.

| 칸 | 내용 |
|---|---|
| **무엇** | 아래 항목 표 7-1 ~ 7-11. 코드 결함이 아니라 **kernel 의 설계 결정(닫힌 `AppErrorKind`·`Instant=Date`·평면 유니온)이 소비자에게 치르게 하는 비용**과 **담당이 없는 구현체**다. |
| **왜 지금 안 했나** | S1-2 의 완료 기준(오류 계층·`Result` 단위 시험, 오류→HTTP 표 시험)은 닫혔고, 각 항목은 그 값을 **쓰는 작업**(소비 패키지·CM-03·CI)이 있어야 실제 모양이 정해진다. 소비자가 0 인 지금 고치면 추측으로 고치게 된다. 7-1 은 계획이 담당 행이 없음을 발견했으나(R13) 행을 만드는 것은 사용자 몫이라 만들지 않았다. |
| **언제까지** | 항목별로 다름 — 표의 **담당** 칸. 가장 이른 것은 S1-3(7-3), 가장 위험한 것은 S1-7 이전(7-1). |
| **누가** | 표의 담당 칸. **미배정이 셋**(7-1·7-10·7-11)이고 임의 ID 를 만들지 않았다. 7-11 은 담당 없이 2026-11-18 에 닫혔다(남은 미배정 7-1·7-10). |
| **닫는 방법** | 항목별 — 표의 마지막 칸. |
| **완료 판정** | 항목별로 표에 적었다. 공통: 닫을 때는 이 절의 행을 지우지 않고 [닫힌 항목](#닫힌-항목) 으로 옮긴다. |

| # | 무엇 | 왜 문제인가 | 담당 · 기한 | 닫는 방법 |
|---|---|---|---|---|
| 7-1 | **(2026-11-26 닫힘 — W2 가 `packages/infra/src/system/` 에 두 구현을 만들었고 S1-7 조립 루트가 `compose/boot.ts` 에서 꽂는다)** **`SystemClock`·`UuidV7Generator` 의 담당 작업이 없다.** kernel 은 `Clock`·`IdGenerator` 인터페이스만 만들었고(R13), 16 §14 가 설계한 **실구현체**를 만드는 행이 `11` 에 없다(`FakeClock`·`FakeIdGenerator` 는 `11` 의 S1-10 testkit 행이 이미 적고 있으므로 비어 있는 것은 실구현 쪽이다). | S1-7 조립 루트가 주입할 실구현이 비어 있고, kernel 은 시간·난수를 쓰지 않는 층이라(B2) 그 구현체는 다른 패키지에 둬야 한다. | **미배정** · S1-7 이전 | 사용자가 `11` 에 행을 더하거나 S1-7·S1-10 범위에 흡수시킨다. 위치(`packages/infra` 로 보이나 정해지지 않음)를 그때 정한다. |
| 7-2 | **(2026-11-18 닫힘 — `domain.ts` 주석 한 줄)** **`ValueObject<Instant>` 의 기본 `equals` 가 참조 비교다**(리뷰 잔여 m-3, H-7). `Instant` 가 `Date` 라 같은 시각의 두 값이 다르다고 나온다. | 계획 T2 가 정한 동작 그대로라 결함은 아니고, **시각 값 객체를 만드는 사람마다 직접 걸린다.** | S2 첫 모듈 · 그 값 객체를 만들기 전 | `domain.ts` 의 `ValueObject` 주석에 "`Date`·`Instant` 필드는 `equals` 를 덮어쓴다" 한 줄(리뷰 r1 의 m-3 제안 문면), 또는 모듈 VO 가 `equals` 를 덮는다. |
| 7-3 | **(S1-3 에서 닫힘 2026-11-18)** **소비 패키지의 `"@pf/kernel": "workspace:*"` 선언 규칙이 문서에 없다**(H-2). 선언하면 `tsc`·`bun test`·`arch` 가 통과하고 안 하면 셋 다 실패한다는 것을 저장소 밖 사본에서 쟀다. | ADR-052 결정 5("적어 둔 의존만으로 타입검사")가 isolated 링커 덕에 자동으로 지켜지지만 **그 사실이 어디에도 안 적혀 있어** 링커 설정이 바뀌면 조용히 풀린다. | **S1-3** (kernel 을 의존하는 첫 패키지) | 패키지 간 해석을 실저장소에서 재고 `01 §1.1` 또는 `§4` 에 규약 한 줄을 적은 뒤, 위 TD-6 의 `@pf/*` 행을 실측 결과로 바꾼다. **닫힘 — 01 §2 에 규약 한 줄(`01-repository-structure.md` §2), TD-6 `@pf/*` 행에 실측을 적었다.** |
| 7-4 | **`AppErrorKind` 가 18종으로 닫혀 있다**(H-3). 402(`PaymentDeclinedError`)·202(`PaymentPendingError`)·검증 계열 422(`ScanMismatchError`) 등 Phase 문서가 쓰는 상태는 kind 를 더해야 표현된다. | kind 추가는 kernel 공개 표면 변경이라 ADR-052 의 버전 경계를 올린다. 그것이 major 인지는 `errorToResponse` 의 짜임(전수 `Record<AppErrorKind, …>` 인가)에 달려 있어 **아직 추측**이다. | **CM-03**(`errorToResponse`)·Phase 2·3 계획 | CM-03 이 전수 매핑을 쓰는지 정하고 kind 추가의 버전 영향을 계획에 적는다. 202 는 오류가 아니라 응답 코드라 `Result` 성공 쪽으로 보내는 방향도 선택지다(이행 비용 미측정). |
| 7-5 | **(S1-11 몫 2026-11-26 닫힘 — `modules/observability/src/error-fields.ts` 가 `err.kind` 를 `DomainError`/`InfraError`/그 밖으로 가르고 `err.code` 는 `AppError.code` 다. 계약 DTO 몫은 2026-11-27 닫힘 — `modules/events-contract/src/errors.ts` 의 `ContractErrorDto { code; message; traceId }` 가 판별을 `code` 로 하고 `kind`·`name` 을 싣지 않는다)** **오류의 직렬화 경계가 문서와 다르다**(H-4·H-5). `JSON.stringify` 는 `name`·`code`·`httpStatus`·`retryable`·`details` 만 내고 `kind`·`message`·`cause` 는 안 낸다(`kind` 는 프로토타입 접근자). 계획 R-3 은 서비스 사이 판별을 `kind` 로 적었으나 실제로 실리는 것은 `name` 이다. 로그 필드 `err.kind`(`17-ops-observability.md:693`, `domain\|infra\|unexpected`)와 kernel `AppError.kind`(클래스 이름)는 **이름이 충돌**한다. | 추출 게이트(S1-18)가 사본 사이 판별을 `kind` 위에 세우면 운영에서 모든 도메인 오류가 500 으로 나간다(외부 시각 I-1). | **S1-18**(계약·추출 게이트) · **S1-11**(관측) · CM-03 | 판별 필드를 `name`·`code` 로 쓰거나 계약 DTO 에 own `kind` 를 명시한다. 로그 `err.kind` 는 `DomainError`/`InfraError` 판별로 만든다. |
| 7-6 | **이벤트 payload 의 `Instant`(Date) 는 JSON 왕복 뒤 문자열이다**(H-6). DB `now()` 컬럼이 마이크로초라 `Date` 로 읽으면 잘릴 수 있다 — **쓰는 쿼리가 없어 추측이다.** | 역직렬화 규칙 없이 동등 비교 키로 쓰면 값이 어긋난다. | 13-events 파이프라인 · **S1-4**(`packages/db`) | payload 역직렬화에 시각 복원 규칙을 두고, 읽은 시각을 동등 비교 키로 쓰지 않는다. |
| 7-7 | **M-1 타입 가드와 DV-009 조기 반환 가드가 `bun run check`(tsc) 에서만 판정된다**(H-8). `bun test` 만으로는 안 돈다. | 검증 매니페스트에 `check` 가 등록돼 있어 지금은 잡히지만, CI 가 `bun test` 만 돌리면 `APP_ERROR_TABLE` 의 `readonly` 가 풀려도 모른다. | **S1-6**(CI) · TD-4 와 같은 자리 | CI 에 `bun run check` 잡을 넣는다. TD-4 의 H-4(CI 에서 의도적 위반이 `arch` 를 빨갛게 만드는지)와 함께 본다. **(S1-6 배선됨, 첫 CI 실행 확인 대기)** `ci.yml` 의 `typecheck` 잡이 `bun run typecheck`(`tsc -b --noEmit`)를 돌린다 — `check` 는 lint·typecheck 를 묶은 것이라 CI 는 둘을 별도 잡으로 둔다. |
| 7-8 | **`CommandHandler`·`QueryHandler` 가 빈 확장 인터페이스라 컴파일러가 구분하지 못한다**(외부 시각 I-17). 서로 대입된다. | "타입으로 분리"(00 §4.3 취지)가 구조적 타입에서 저절로 생기지 않는다. 구분을 B3(`check-cqrs`)가 대신하는지는 **교육 문서가 "단정 못함"으로 표시**했다 — 확인하지 못했다. | **S2-1** (TD-6 의 "B3 어댑터 스키마 대조" 와 함께) | 첫 usecase 에서 `check-cqrs` 가 두 인터페이스를 구분하는지 양성 시험으로 확인하고, 안 되면 브랜드 필드를 더하거나 B3 에 규칙을 넣는다. |
| 7-9 | **`GithubUpstreamError` 의 `github_rejected` 상태(502) 가 16 §6.5 순서도와 충돌한다.** 어느 쪽이 맞는지 판정하지 않았다. | `errorToResponse` 를 만들 때 표(kernel)와 순서도(16)가 서로 다른 상태를 낸다. | **CM-03** | 둘 중 정본을 정하고 다른 쪽을 고친다(DV 행으로 기록). |
| 7-10 | **설계 문서의 오류 이름·상태를 kernel 표와 기계로 대조하는 장치가 없다.** S1-2 에서 `11-guestbook-write.md` 가 틀린 클래스를 적고 있었는데(H-1) 영향분석의 사람 눈 대조가 찾았다. 계획의 문서 대조가 **바꾼 이름만** 찾고 표와 값이 다른 행은 찾지 않았다(KB 교훈). | 같은 종류의 어긋남(문서대로 구현하면 422 가 아니라 409 가 나가는 식)이 다른 문서에도 남아 있을 수 있다. 직접 연 문서에서는 틀린 짝이 0줄이었으나 **전수는 아니다.** | **미배정** · 오류 표를 쓰는 두 번째 작업 전 | `APP_ERROR_TABLE` 의 클래스·상태·code 를 읽어 `docs/design/` 의 오류 표 행과 대조하는 스크립트(`check:trace` 류 — S1-16 이 비슷한 일을 한다). 담당은 사용자가 정한다. |
| 7-11 | **(2026-11-18 닫힘 — 규칙 목록에 `Temporal.Now`, 양성 시험 7종이 고치기 전 엔진에서 빨강)** **`B2-time-random` 금지어에 `Temporal.Now` 가 없다.** Bun 1.4.4 는 `Temporal` 을 내장하는데 AST 판정으로 바뀐 `check-purity`(S1-5b, TD-1 닫힘)의 규칙 목록에도 `Temporal.Now.*` 가 없어 domain·service 코드가 시계를 걸리지 않고 읽는다(S1-2 영향분석이 발견). 엔진을 바꿔도 **규칙 목록에 넣어야** 닫히는 종류다. | 시간 직접 호출 금지가 첫 제품 모듈에서 조용히 샌다(B2). 실측 근거는 `.pipeline-dev/` 산출물이라 저장소에 없다 — 닫을 때 시험이 근거가 된다. | **미배정** · S2-1 이전 | `check-purity.ts` 의 시간·난수 규칙에 `Temporal.Now` 접근을 더하고 양성 시험(`Temporal.Now.instant()`·`Temporal.Now.plainDateISO()` 등)을 **고치기 전 엔진에서 빨강**으로 확인한다. 01 §5 B2 칸에도 한 줄. |

### 이 절에서 이미 닫은 것 (기록용)

- **H-1** — `11-guestbook-write.md:807·808`(와 같은 결함인 `:634`)의 오류 이름을 kernel 정본으로 고쳤다. S1-2 커밋 `98ceec8`(03-implementation-r3, 재리뷰 🟢). 닫은 항목 표에는 올리지 않는다(TD 번호를 받은 적이 없다).

### 확인하지 못한 것 (부채가 아니라 미확인)

- 실제 CI 러너·Windows 에서의 isolated 링크, Node 계열 도구가 `exports` 의 `.ts` 를 런타임에 임포트하는 경우. **S1-6** 이 CI 를 배선했고(2026-11-25) 첫 CI 실행이 실측 자리다. TD-4 의 H-1(node 25.1.0 engines)과 같은 부류다.

**근거**: [교육 문서 S1-2](../teaching/s1-2-kernel-20261117-1532.md) · 커밋 `98ceec8` · [`../deviation-log.md`](../deviation-log.md) DV-009~011 · [`../design/11-implementation-plan.md`](../design/11-implementation-plan.md).

---

## TD-8 — S1-4(`packages/db`) 가 남긴 것

S1-4 는 완료 기준과 후속이 코드로 기대는 계약까지만 구현했다. 아래는 **알면서 미룬 것**이다. 설계 문서와 어긋난 곳은 [`deviation-log.md`](../deviation-log.md) DV-015~017 에 있다.

| # | 무엇 / 왜 지금 안 했나 | 누가 · 언제까지 | 닫는 방법 / 완료 판정 |
|---|---|---|---|
| 8-1 | **UoW 재시도·분류·지표·느린 tx 로그가 없다.** `retryOnSerialization`(40001·40P01 재시도)·`TransientError` 분류·지표·느린 트랜잭션 로그는 소비자 코드에 보이지 않는 동작이라 첫 소비자(S2-1) 없이 정하면 틀린다. 지금 `run` 은 DB 오류를 전부 `PermanentError`(원인은 `cause`)로 낸다 | **미배정** · S2-1 이전 | 직렬화 실패를 `TransientError` 로 사상하고 재시도 횟수·지표 이름을 정한다. 완료: 40001 을 일으키는 통합 시험이 재시도 뒤 `Ok`, 한도 초과면 `TransientError` |
| 8-2 | **`assertUpToDate`(기동 시 마이그레이션 확인)가 없다.** 모듈별 "기대 버전"의 정의(저널 마지막 `when`? 항목 수?)가 설계에 없다 | **미배정** · S1-7 조립 루트가 기동 순서를 정하기 전 | 기대 버전을 정의하고 `MigrationBehindError` 로 거절한다. 완료: 한 항목 덜 적용된 DB 에서 기동이 거절되는 시험 |
| 8-3 | **(2026-11-26 닫힘 — `DbPool.stats()`(Bun.SQL 이 주는 `max` 만)·`close(deadlineMs)`(필수 인자)·`ping`)** **`DbPool.stats()`·`close(deadlineMs)`가 없다.** 생명주기(종료 순서·기한)는 조립 루트의 몫이다. 지금 `close()` 는 기한 없이 닫는다 | **S1-7** | `ShutdownCoordinator` 와 함께 풀 통계·종료 기한을 더한다 |
| 8-4 | **`roles.json` 이 시퀀스·함수 권한을 다루지 않고, "모든 표가 분류돼 있는가" CI 검사가 없다.** 기본키는 앱이 만드는 uuid v7 이라 시퀀스가 없다(첫 제품 모듈이 시퀀스를 쓰면 틀린다). 지금은 명세에 없는 표가 권한 0 으로 남을 뿐 검출되지 않는다 | **미배정** · S2-1 이전 | 시퀀스·함수·`ALTER DEFAULT PRIVILEGES` 를 명세에 더하고, 명세에 없는 표를 CI 가 실패시킨다 |
| 8-5 | **drizzle-kit 이 쓰는 저널 형식(공백 2칸)과 Biome(탭)이 충돌한다.** 첫 모듈이 `modules/**` 에서 생성하는 `_journal.json` 이 `bun run lint` 에서 형식 오류로 걸릴 수 있다. S1-4 의 픽스처는 손으로 탭으로 썼다 | **S2-1** (첫 모듈) | `biome.json` 에서 저널을 제외하거나 생성 뒤 포맷하는 단계를 `db:generate` 에 둔다. 완료: 생성 직후 `bun run check` 초록 |
| 8-6 | **마이그레이션 잠금 대기에 시간 상한이 없다.** 다른 실행기가 잠금을 쥐고 멈추면 `db:migrate` 가 무한히 기다린다. 새 수치를 만들지 않으려고 두지 않았다(D-8) | **미배정** · 배포 파이프라인 작업 전 | 대기 상한(`lock_timeout` 류)을 정하고 초과 시 `Err`. 완료: 잠금을 쥔 채 두고 상한 뒤 `Err` 로 끝나는 시험 |
| 8-7 | **`roles.json` 의 `roles` 목록에서 뺀 역할의 기존 권한은 회수되지 않는다.** 회수 대상은 이번 명세가 아는 역할(`PUBLIC` + `roles`)뿐이라 목록에서 빠진 역할은 어떤 문장의 대상도 아니다 — 명세가 더는 모르는 이름을 코드로 닫을 수 없다(L3 재현: 역할까지 뺀 재적용 뒤 `USAGE` 가 남음). 역할 생성과 마찬가지로 역할 수명 관리의 몫이다 | **미배정** · 관리 역할을 처음 폐기하기 전 | 역할을 폐기할 때 사람이 `DROP OWNED BY <역할>` → `DROP ROLE <역할>` 을 실행한다(`roles.json` 에서 빼기만 하면 안 된다). 역할 수명 관리를 넣을 때 폐기 목록을 명세가 알게 한다. 완료: 폐기한 역할로 접속·권한 질의가 거부되는 시험 |
| 8-8 | **(2026-11-27 닫힘 — WSL2(Ubuntu 26.04)·Docker 에서 완료 판정 통과: 빈 compose → `01-roles.sh` 가 역할 4개를 만듦(`01-roles.sh: 역할 생성 완료`) → `db:migrate` 종료 0 이고 두 번째 실행도 0)** **`db:migrate` 는 `roles.json` 의 관리 역할이 클러스터에 먼저 있어야 성공한다.** 첫 모듈 마이그레이션이 `pf_migrations` 스키마를 만든 순간부터 필요하다 — 역할이 없으면 마이그레이션은 커밋되고 권한 단계에서 종료 1(`role "pf_api_rw" does not exist`, 이력은 남는다. L3 재현). 역할은 `postgres` 최초 기동 init SQL 이 만든다는 설계(`docs/design/10-security.md` §5.1)이고 S1-4 는 역할 생성 SQL 을 범위에서 뺐다(0단계 Q4) | **S1-7**(로컬 compose) · 배포 파이프라인 작업 | init SQL 이 `roles.json` 과 같은 이름의 역할을 만든다. 완료: 빈 compose 에서 init → 모듈 1개 이상으로 `bun run db:migrate` 종료 0 |
| 8-9 | **(2026-11-26 닫힘 — `scripts/run-as.ts` 가 `DATABASE_URL_<ROLE>` 을 자식의 `DATABASE_URL` 로 매핑하고 `db:migrate` 는 `run-as.ts MIGRATOR` 를 거친다. `DATABASE_URL_MIGRATOR` 만 있고 Postgres 가 없을 때 종료 1(연결 실패), 변수가 없으면 78)** **로컬 템플릿 `.env` 로는 `db:migrate` 가 종료 78 이다.** `.env.example` 은 `DATABASE_URL_API`·`_GATEWAY`·`_WORKER`·`_MIGRATOR` 넷만 갖고 `db:migrate` 는 `DATABASE_URL` 하나만 읽는다. 매핑은 `dev` 스크립트 몫이라 적혀 있지만(`docs/design/02-dev-environment.md` §5) `db:migrate` 는 `dev` 를 거치지 않는다 | **S1-7** | `db:migrate` 가 로컬에서 `DATABASE_URL_MIGRATOR` 를 `DATABASE_URL` 로 매핑하게 하거나 템플릿·문서가 `DATABASE_URL` 을 직접 두게 한다. 완료: `cp .env.example .env` 후 값만 채우고 `bun run db:migrate` 가 78 이 아니다 |

**근거**: [`../design/features/16-cross-cutting.md`](../design/features/16-cross-cutting.md) §3.4·§8 · [`../adr/ADR-025-query-layer.md`](../adr/ADR-025-query-layer.md) · [`../design/11-implementation-plan.md`](../design/11-implementation-plan.md) S1-4.

---

## TD-9 — S1-8(`PostgresEventTransport`)이 남긴 것

전달 어댑터는 표를 소유하지 않는다(F16 §10.2). 통합 시험이 쓸 inbox 표를 **실제 마이그레이션이 아니라 시험 전용 DDL** 로 두었다 — 마이그레이션은 추가 전용이라, 그 표를 실제로 쓰는 S3-4 가 열·인덱스를 바꾸고 싶을 때 고쳐 쓰지 못하고 보정 마이그레이션을 쌓아야 하기 때문이다(계획 Q9-A — 체크포인트 A 에서 사용자가 확정).

| # | 무엇 / 왜 지금 안 했나 | 누가 · 언제까지 | 닫는 방법 / 완료 판정 |
|---|---|---|---|
| 9-1 | **시험 전용 inbox 표(`packages/infra/test/integration/fixtures/inbox.sql`)가 실제 inbox 와 어긋날 수 있다.** 열은 DBS §4-5 공통 형태의 일부이고 `arrival` 은 시험 전용 열이다. 실제 inbox 마이그레이션이 없어 지금은 맞출 대상이 없다 | **S3-4** · inbox 마이그레이션을 만들 때 | 이 fixture 를 실제 inbox 마이그레이션 적용(`runMigrations`)으로 바꾸고 `storeInInbox` 가 실제 열을 쓰게 한다. 완료: `inbox.sql` 삭제, `postgres-event-transport.test.ts` 가 마이그레이션된 표로 초록 |

---

## 닫힌 항목

| ID | 요약 | 상태 | 닫은 날짜 | 커밋 |
|---|---|---|---|---|
| TD-1 (P1) | `check-purity` 를 정규식에서 swc AST 로 교체 (DV-008). 완료 판정 (a)~(e) 충족 | 닫힘 | 2026-11-17 | S1-5b 커밋 `01d9a78` |
| TD-2 D-1~D-4 | D-1(a) 수치를 참고값(재현 불가)·커밋된 근거로, D-2 "표현할 수 없다"·"확정" 제거, D-3 규모 시험 삭제로 소멸, D-4 주석 정정 | 닫힘 | 2026-11-17 | S1-5b 커밋 `01d9a78` |
| TD-3 m-1~m-3 | AST 전환으로 소멸(m-2 는 양성 시험 6종이 고치기 전 엔진에서 빨강) | 닫힘 (소멸) | 2026-11-17 | S1-5b 커밋 `01d9a78` |
| TD-5 | `bun test` 의 `.env` 자동 로드 — 루트 `bunfig.toml` 최상위 `env = false` + 대조군을 가진 시험(`scripts/bunfig-env.test.ts`). 부작용: 루트의 모든 bun 명령이 `.env` 를 안 읽는다(S1-4 `db:migrate`·S1-7 `dev`·`db:seed`·`worker <cmd>` 는 `--env-file`) | 닫힘 | 2026-11-18 | S1-3 커밋 `9331e04` |
| TD-6 (`@pf/*` 행) | 실저장소 `@pf/*` 워크스페이스 해석 — `workspace:*` 선언 유무로 세 도구가 통과/실패함을 실측(실패 증명 포함) | 닫힘 | 2026-11-18 | S1-3 커밋 `9331e04` |
| TD-7 7-3 | 소비 패키지의 `workspace:*` 선언 규약 — `01-repository-structure.md` §2 에 한 줄 | 닫힘 | 2026-11-18 | S1-3 커밋 `9331e04` |
| TD-7 7-2 | `ValueObject` 주석에 "`Date`·`Instant` 필드도 `equals` 를 덮어쓴다" 한 줄(`packages/kernel/src/domain.ts`) — 코드 동작 변경 없음 | 닫힘 | 2026-11-18 | 커밋(해시는 커밋 후 기입) |
| TD-7 7-11 | `check-purity` 의 `B2-time-random` 규칙 목록에 `Temporal.Now` 를 더함 — 양성 시험 7종(호출·참조·`?.`·`["Now"]`·`globalThis`·줄바꿈)이 고치기 전 엔진에서 빨강, `01` §5 B2 칸 갱신. `Temporal` 전역 존재는 Bun 1.4.2 호스트에서 이번 런 실측(근거: gitignore 된 `.pipeline-dev/` 산출물, 저장소에 없음) — 판정 근거는 정적 시험이다 | 닫힘 | 2026-11-18 | 커밋(해시는 커밋 후 기입) |
| TD-7 7-1 | `SystemClock`·`UuidV7Generator` — W2 가 `packages/infra/src/system/` 에 만들고(S1-8 몫으로 흡수, ANSWERS 0단계 Q3) S1-7 이 `apps/*/src/compose/boot.ts` 에서 꽂음. 시험 `packages/infra/test/system.test.ts` | 닫힘 | 2026-11-26 | 커밋(해시는 커밋 후 기입) |
| TD-7 7-5 (S1-11 몫) | 로그 `err.kind` 를 `DomainError`/`InfraError`/그 밖으로 판별(`AppError.kind` 를 읽지 않음) — 시험 `modules/observability/test/logger.test.ts`(kernel 클래스 전수, `kind` 읽기로 약화하면 빨강) | 닫힘 | 2026-11-26 | 커밋(해시는 커밋 후 기입) |
| TD-7 7-5 (S1-18 몫) | 계약 DTO 의 판별은 `code` — `modules/events-contract` 의 `ContractErrorDto { code; message; traceId }` 와 골든 `golden/contract-error.v1.json`(`kind`·`name` 없음). 시험 `modules/events-contract/test/errors.test.ts` 가 골든의 키 집합을 단언하고, 골든이 바뀌면 `check:contract-version` 이 버전 상승을 요구한다 | 닫힘 (7-5 전체 닫힘) | 2026-11-27 | 커밋(해시는 커밋 후 기입) |
| TD-6 B14 SQL 절 | `scripts/check-migration-isolation.ts` — 모듈 마이그레이션 SQL 의 타 모듈 스키마 참조를 `MS-foreign-schema` 로 실패시킨다(DV-005 의 SQL 절). 시험 `scripts/check-migration-isolation.test.ts`(픽스처 `scripts/fixtures/migration-isolation/` + 실저장소) | 닫힘 | 2026-11-27 | 커밋(해시는 커밋 후 기입) |
| TD-8 8-3 | `DbPool.stats()`·`close(deadlineMs: number)`(필수 인자, 호출부 전수 갱신)·`ping(pool, timeoutMs)` — 시험 `packages/db/test/pool-lifecycle.test.ts`·`packages/infra/test/lifecycle/` | 닫힘 | 2026-11-26 | 커밋(해시는 커밋 후 기입) |
| TD-8 8-9 | `scripts/run-as.ts` 가 역할별 주소를 `DATABASE_URL` 로 매핑(다른 역할 주소는 자식 환경에서 제거) — 시험 `scripts/run-as.test.ts` | 닫힘 | 2026-11-26 | 커밋(해시는 커밋 후 기입) |
| TD-8 8-8 | `infra/compose/init/01-roles.sh` 가 `roles.json` 의 역할과 `pf_migrator` 를 만든다 — 완료 판정(빈 compose → init → `db:migrate` 종료 0)을 WSL2·Docker(postgres:18-alpine)에서 실측: postgres healthy, init 로그 `역할 생성 완료(pf_api_rw pf_worker_rw pf_gateway_ro pf_migrator)`, `db:migrate` 종료 0(재실행도 0). 같은 환경에서 `bun run dev` → api readyz·healthz 200, worker healthz 200(readyz 는 설계대로 404), postgres 정지 시 api readyz 503·healthz 200, SIGTERM → `shutdown start`(grace 25 s) → readiness·http·modules·dbPool·config 역순 정지 → 종료 0, `bun run test:integration` 64 pass | 닫힘 | 2026-11-27 | 확인 대상 커밋 `0146a99` (문서 갱신은 후속 커밋) |
