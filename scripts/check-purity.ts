// 문자열 규칙 판정 — 소스 텍스트 하나를 받아 위반을 돌려주는 순수 함수다(파일을 읽지 않는다).
// 임포트가 아니라 호출·문자열이라 dependency-cruiser 가 못 잡는 규칙을 맡는다.
// 규칙의 정본은 docs/design/01-repository-structure.md §5. 실행은 `bun run arch` 로만 한다(scripts/arch.ts).
import type { ArchViolation } from "./arch.ts";

type PurityRule = {
	readonly id: string;
	/** 검사 루트 기준 상대 경로가 이 규칙의 대상인가. */
	readonly applies: (path: string) => boolean;
	/**
	 * 위반으로 보는 패턴 — 갈래 하나가 정규식 하나다. 한 줄이 아니라 파일 전체 텍스트에 돌리므로
	 * 포매터(Biome)가 줄을 나눈 호출·구조분해·임포트도 잡는다. 보고하는 줄은 매치가 시작한 줄이다.
	 * 반드시 g 플래그를 둔다(matchAll). 주석·문자열 안도 잡는다(보수적).
	 * 토큰으로 나누지 않으므로 호출·구조분해의 토큰 사이에 주석이 끼거나 문자열 안에 짝이 안 맞는 중괄호가 있으면 못 잡는다.
	 * 멤버 접근의 `.` 는 앞뒤 공백(줄바꿈 포함)을 허용한다 — 포매터가 `crypto` 와 `.randomUUID()` 사이처럼 `.` 앞에서 나누기 때문이다.
	 */
	readonly patterns: readonly RegExp[];
};

/** 제품 소스 — apps·modules·packages 각 단위의 src. 시험(test)·scripts 는 정당하게 환경을 읽는다. */
export function isProductSource(path: string): boolean {
	return /^(apps|modules|packages)\/[^/]+\/src\//.test(path);
}

// 구조분해 갈래를 만드는 조각 — 중괄호 한 겹의 안쪽을 본다. 안쪽 중괄호는 두 겹까지 짝을 맞춰 건너뛰므로
// { env: { DB: { URL } } } 처럼 세 겹까지 이어지고, `}` 에서 멈추므로 함수 매개변수 `({ env })` 와
// 뒤따르는 `const { argv } = process` 를 한 구조분해로 잇지 않는다(`[^;]` 로 문장만 자르면 줄을 넘어 잇는다).
const BRACE_1 = String.raw`\{[^{}]*\}`;
const BRACE_2 = String.raw`\{(?:[^{}]|${BRACE_1})*\}`;
const INSIDE = `(?:[^{}]|${BRACE_2})*`;

const RULES: readonly PurityRule[] = [
	{
		// 설정 우회 — 환경 접근은 packages/config 에서만(B9). 갈래는 모두 같은 접근의 다른 표기다:
		//   process.env·Bun.env·import.meta.env / process·Bun 의 ?.·[ 접근 / { env } = process|Bun 구조분해 / bun 의 env 명명 임포트.
		// 미탐(한계): 이름공간·기본 임포트(import * as b from "bun" · import b from "bun")의 b.env, 별칭(const p = process),
		//   require("bun")·import("bun") 경유는 문자열로 못 잡는다. 구조분해는 키를 따옴표·계산식으로 쓰거나({ "env": e }),
		//   키 앞에 주석이 끼거나, 타입 주석(const { env }: T = process)이 붙거나, 중괄호가 네 겹 이상이면 못 잡는다.
		// 오탐(한계): ?.·[ 접근은 속성 이름을 따지지 않아 process["exitCode"] 도 걸리고, 앞에 . 이 붙은 멤버 접근
		//   (job.process?.() · this.process[step])도 걸린다 — 앞의 . 을 빼면 globalThis.process?.env 를 놓치기 때문이다.
		id: "B9-env",
		applies: (path) =>
			isProductSource(path) && !path.startsWith("packages/config/"),
		patterns: [
			/\bprocess\s*\.\s*env\b|\bBun\s*\.\s*env\b|\bimport\s*\.\s*meta\s*\.\s*env\b/g,
			/\b(?:process|Bun)\s*(?:\?\.|\[)/g,
			// 닫는 `}` 뒤가 process|Bun 대입인지를 앞서 한 번 보고(전방 탐색), 그 뒤에야 키 위치의 env 를 찾는다 —
			// 반대 순서면 같은 키가 많은 객체에서 후보마다 중괄호 끝까지 다시 훑어 이차로 늘어난다.
			// 한계: 구조분해 하나가 수백 KB(키 수만 개)를 넘으면 정규식 엔진의 되추적 한도로 조용히 못 잡는다.
			new RegExp(
				String.raw`\{(?=${INSIDE}\}\s*=\s*(?:globalThis\s*\.\s*)?(?:process|Bun)\b)(?:${INSIDE},)?\s*env\b`,
				"g",
			),
			/\{(?=[^{}]*\}\s*from\s*["']bun["'])[^{}]*\benv\b/g,
		],
	},
	{
		// 시간·난수 직접 호출 금지(domain·service). 인자가 있는 new Date(value) 는 값 변환이라 대상이 아니다.
		// new Date 괄호 생략·Date() 와 performance.now·crypto.getRandomValues·Bun.nanoseconds 는 같은 계열의 다른 표기·API 다.
		id: "B2-time-random",
		applies: (path) => /^modules\/[^/]+\/src\/(domain|service)\//.test(path),
		patterns: [
			/\bDate\s*\.\s*now\b|\bMath\s*\.\s*random\b|\bcrypto\s*\.\s*(?:randomUUID|getRandomValues)\b|\bperformance\s*\.\s*now\b|\bBun\s*\.\s*nanoseconds\b/g,
			/\bnew\s+Date\b(?!\s*\()/g,
			/\bDate\s*\(\s*\)/g,
		],
	},
	{
		// 쓰기는 adapter/postgres 안에서만(B11, ADR-025). Map·Set 의 같은 이름 메서드도 걸린다.
		// 쓰기 execute 는 인자가 문자열·템플릿 리터럴·sql.raw 인 형태만 본다 — .execute( 전체를 막으면 usecase 의 handler.execute(cmd) 관례가 걸린다.
		// 포매터가 인자를 다음 줄로 내린 호출도 잡는다. 변수로 넘긴 SQL 은 문자열 검사로 못 잡는다.
		id: "B11-write",
		applies: (path) =>
			isProductSource(path) && !path.includes("/adapter/postgres/"),
		patterns: [
			/\.(?:insert|update|delete)\(/g,
			/\.execute\(\s*(?:["'`]|sql\s*\.\s*raw\b)/g,
		],
	},
	{
		// raw SQL 은 adapter/postgres/raw/ 에서만(ADR-025). Drizzle 기본값 sql`now()` 와 sql.raw( 도 걸린다.
		id: "B11-raw-sql",
		applies: (path) =>
			isProductSource(path) && !path.includes("/adapter/postgres/raw/"),
		patterns: [/\bsql\s*`/g, /\bsql\s*\.\s*raw\(/g],
	},
];

/** 각 줄이 시작하는 위치(0부터) — 오름차순이다. 매치마다 앞부분을 잘라 세면 매치 수 × 파일 크기라 한 번만 만든다. */
function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
		starts.push(i + 1);
	}
	return starts;
}

/** 텍스트 안의 위치(0부터)가 속한 줄 번호(1부터) — `starts` 를 이분 탐색한다. */
function lineOf(starts: readonly number[], index: number): number {
	let low = 0;
	let high = starts.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if ((starts[mid] ?? 0) <= index) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	return low + 1;
}

/**
 * 소스 텍스트 하나에서 문자열 규칙 위반을 찾는다. `path` 는 검사 루트 기준 상대 경로(슬래시 구분)다.
 * 한 줄에 같은 규칙이 여러 번 나와도 한 건이다.
 */
export function scanPurity(path: string, text: string): ArchViolation[] {
	const violations: ArchViolation[] = [];
	const starts = lineStarts(text);
	for (const rule of RULES.filter((r) => r.applies(path))) {
		const lines = new Set<number>();
		for (const pattern of rule.patterns) {
			for (const match of text.matchAll(pattern)) {
				lines.add(lineOf(starts, match.index));
			}
		}
		for (const line of [...lines].sort((a, b) => a - b)) {
			violations.push({ rule: rule.id, from: path, line });
		}
	}
	return violations;
}

/** 이 파일이 낼 수 있는 위반 ID — 규칙 목록과 시험 기대 표의 대응을 확인하는 데 쓴다. */
export const PURITY_RULE_IDS: readonly string[] = RULES.map((rule) => rule.id);
