# 코드 해설 — 남은 기술부채 중 TD-7 7-11 · 7-2 닫기

## TL;DR — 이 변경을 한 문장으로
- `check-purity` 의 B2 규칙(시간·난수 직접 호출 금지)이 `Temporal.Now.*` 를 잡도록 규칙 표에 한 항목(`["Temporal", "Now"]`)을 더하고 시험으로 증명했으며(7-11), `ValueObject` 주석에 `Date`·`Instant` 필드는 `equals` 를 덮어쓰라는 한 줄을 넣고(7-2), 두 항목을 `tech-debt.md` 에서 닫힘 처리했다.
- 반영하지 않은 것: `const { Now } = Temporal` 같은 구조분해·별칭은 여전히 못 잡는다(기존 한계 주석이 이미 적은 범주).

## 전체 그림
- `scripts/check-purity.ts` 는 swc AST 로 domain·service 코드를 훑어 금지 패턴을 찾는 정적 검사다(`bun run arch` 에 포함). B2 는 `Date.now`·`Math.random`·`performance.now` 등 "[객체, 속성]" 쌍 표(`TIME_RANDOM_MEMBERS`)로 시계·난수 접근을 막는다. 도메인 코드가 시계를 직접 읽으면 시험이 흔들리므로 시계는 포트(`Clock`)로 주입해야 한다.
- `Temporal.Now` 는 `instant()`·`plainDateISO()` 등 멤버가 전부 시계다. 멤버를 하나씩 나열하면 새 멤버가 생길 때 미탐이 되므로 **한 단계 위(`Temporal.Now`)** 에서 막았다. 판정 함수는 건드리지 않았고 표 항목만 늘렸다(계획 Q1 = A).

## 코드 블록별 해설
### scripts/check-purity.ts — `TIME_RANDOM_MEMBERS`
- **목적**: `Temporal.Now` 접근을 B2 위반으로 만든다.
- **한 줄 해설**: 배열에 `["Temporal", "Now"]` 추가(`:225` 부근). 객체가 전역 이름 또는 `globalThis.` 경유일 때 속성이 `Now` 이면 잡힌다. 호출이 아니라 참조(`const n = Temporal.Now;`)만으로도 잡힌다.
- **수정 포인트**: 새 시계 API 는 같은 배열에 쌍을 추가한다. 위 문서 주석과 B2 규칙 블록의 한계 주석(`:352` 부근)도 같이 고친다.

### scripts/check-purity.test.ts — B2 양성·음성 시험 두 개
- **목적**: 회귀 가드. 양성은 호출·참조·`globalThis.`·`?.`·`["Now"]`·줄바꿈 나눔 7종이 모두 `B2-time-random:1` 을 내는지, 음성은 `Temporal.Instant.from(...)`·`x.Temporal.Now.instant()`(다른 객체의 `Temporal`)가 안 잡히는지 본다.
- **한 줄 해설**: 규칙 목록을 고치기 전에 시험만 먼저 돌려 양성이 88 pass / 1 fail(7종 전부 미탐)임을 확인했고, 항목을 넣은 뒤 89 / 0 이 됐다. "고치기 전에 실패" 가 회귀 가드의 증거다.
- **수정 포인트**: 시험 이름은 Biome 가 큰따옴표 안의 `\"` 를 거부해 작은따옴표로 썼다. 새 표기를 막고 싶으면 `lines` 배열에 한 줄 추가한다.

### packages/kernel/src/domain.ts — `ValueObject` 주석 (7-2)
- **목적**: 기본 `equals` 는 `Object.is` 비교라 같은 시각의 두 `Date` 가 다르다고 나오는 함정을 알린다.
- **한 줄 해설**: 코드 변경 없이 주석 한 줄. 가드(시험)는 없다.
- **수정 포인트**: 실제로 `Date`·`Instant` 필드를 가진 값 객체가 생기면 그 클래스에서 `equals` 를 덮어쓴다(이 주석이 그 신호).

### docs — `01-repository-structure.md` · `tech-debt.md`
- **목적**: 규칙 문서와 부채 장부를 코드와 맞춘다.
- **한 줄 해설**: B2 표 칸·§5 금지 목록에 `Temporal.Now.*` 추가. `tech-debt.md` 는 한눈표(미배정 3건→2건), 7-2·7-11 행의 닫힘 표기, "닫힌 항목" 표 두 행 추가. 원 행은 지우지 않는다(저장소 규칙).
- **수정 포인트**: 닫힘 행의 커밋 해시는 커밋 뒤 후속 커밋이 채운다(직전 `9b46c16` 과 같은 방식). 남은 미배정은 7-1·7-10.

## "이제 혼자 수정하려면"
- 새 시계·난수 API 를 막으려면: `scripts/check-purity.ts` 의 `TIME_RANDOM_MEMBERS` 에 `[객체, 속성]` 추가 → `check-purity.test.ts` 의 `describe("B2-time-random …")` 에 양성 줄 추가 → `docs/design/01-repository-structure.md` 의 B2 칸·§5 갱신. 순서는 시험을 먼저 돌려 빨강을 본 뒤 표를 고친다.
- 구조분해·별칭 미탐을 닫으려면: 표 항목이 아니라 판정 함수(`timeRandomMember`)와 AST 분기를 고쳐야 한다. 범위가 커서 이번에 하지 않았다.
- 시험 실행: 이 호스트에서 `@swc/core` 네이티브 바인딩이 기본으로는 로드되지 않아 `SWC_NATIVE_BINDING_CACHE=<쓰기 가능한 디렉토리>` 를 붙여 `bun test scripts/check-purity.test.ts` 를 돌렸다. 환경이 다르면 필요 없을 수 있다(코드만으로는 단정 못함).
- 부채 장부 갱신: `docs/domains/tech-debt.md` 의 한눈표·해당 절·"닫힌 항목" 표 세 곳을 같이 고친다.

## 남은 질문
- 구조분해·별칭(`const d = Date; d.now()`, `{ Now } = Temporal`) 미탐을 AST 에서 어떻게 닫을까(TD-7 에 새 행으로 둘지)?
- Bun 1.4.4(고정 버전)에서의 재측정을 하지 않았다. 정적 AST 판정이라 영향이 없다고 봤는데 확인이 필요한가?
- 미배정 7-1(`SystemClock`·`UuidV7Generator` 구현 위치)·7-10(문서-표 대조 스크립트)은 누가 언제 맡을까?

---

## 커밋 메시지 (복사해서 바로 사용 가능)
> 기존 커밋 컨벤션을 따름 (`git log` 확인 결과: 한국어, Conventional Commits 접두사, 본문 개조식, `Authorship` 트레일러 + `Co-Authored-By`).

```
feat: check-purity B2 에 Temporal.Now 를 추가하고 TD-7 7-2·7-11 을 닫는다

- scripts/check-purity.ts: TIME_RANDOM_MEMBERS 에 ["Temporal", "Now"] 추가, 문서·한계 주석 갱신
- scripts/check-purity.test.ts: B2 양성(호출·참조·globalThis·?.·["Now"]·줄바꿈) 및 음성 시험 추가
- packages/kernel/src/domain.ts: ValueObject 주석에 Date·Instant 필드는 equals 를 덮어쓰라는 한 줄 추가(코드 변경 없음)
- docs: 01-repository-structure.md B2 칸·§5 금지 목록, tech-debt.md 한눈표·닫힘 표 갱신(커밋 해시는 후속 커밋에서 기입)
- Temporal.Now 는 멤버가 전부 시계라 한 단계 위에서 막음. 판정 함수는 변경 없음
- 미반영: 구조분해·별칭 미탐은 기존 한계로 남김
- 검증: 규칙 수정 전 시험 88 pass / 1 fail, 수정 후 bun test 271 pass / 0 fail, bun run check·arch exit 0

직접 작성 없음 — 전부 AI 작성.

Authorship: G

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
