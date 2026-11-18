// 소스 규칙 판정 — 소스 텍스트 하나를 swc 로 파싱해 AST 노드를 판정하고 위반을 돌려주는 순수 함수다(파일을 읽지 않는다).
// 임포트가 아니라 호출·접근이라 dependency-cruiser 가 못 잡는 규칙을 맡는다.
// 규칙의 정본은 docs/design/01-repository-structure.md §5. 실행은 `bun run arch` 로만 한다(scripts/arch.ts).

import type {
	AssignmentExpression,
	AssignmentPattern,
	AssignmentPatternProperty,
	BinaryExpression,
	CallExpression,
	ComputedPropName,
	ExportNamedDeclaration,
	Identifier,
	ImportDeclaration,
	KeyValuePatternProperty,
	MemberExpression,
	MetaProperty,
	Module,
	NamedExportSpecifier,
	NamedImportSpecifier,
	NewExpression,
	ObjectPattern,
	ParserConfig,
	StringLiteral,
	TaggedTemplateExpression,
	TemplateLiteral,
	VariableDeclarator,
} from "@swc/core";
import { parseSync } from "@swc/core";
import type { ArchViolation } from "./arch.ts";

/** AST 노드 하나가 위반이면 그 노드의 위치(swc `span.start`)를, 아니면 undefined 를 돌려준다. */
type Detector = (node: AstNode) => number | undefined;

type PurityRule = {
	readonly id: string;
	/** 검사 루트 기준 상대 경로가 이 규칙의 대상인가. */
	readonly applies: (path: string) => boolean;
	/**
	 * 위반으로 보는 노드 모양 — 갈래 하나가 판정 함수 하나다. 파일을 한 번만 파싱해 모든 노드에 적용하므로
	 * 포매터(Biome)가 줄을 나눈 호출·구조분해·임포트도, 토큰 사이에 낀 주석도 판정에 영향을 주지 않는다.
	 * 보고하는 줄은 갈래마다 정한 노드의 시작 줄이다. 주석·문자열 안의 표기는 노드가 아니라서 잡지 않는다.
	 */
	readonly detectors: readonly Detector[];
};

type AstNode = { readonly type: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAstNode(value: unknown): value is AstNode {
	return isRecord(value) && typeof value.type === "string";
}

/**
 * swc 노드는 `type` 문자열로 구별되는 합집합이다. 그 필드를 확인한 뒤 해당 인터페이스로 좁힌다.
 * 호출하는 쪽이 `T` 와 `type` 을 짝지어 적는다 — 짝이 어긋나면 좁힌 타입의 필드가 실제 노드와 다르다.
 */
function isNode<T extends AstNode>(
	value: unknown,
	type: T["type"],
): value is T {
	return isRecord(value) && value.type === type;
}

/** 값을 바꾸지 않고 감싸기만 하는 노드 — 이 안을 들여다봐야 `(process as X).env`·`process?.env` 가 같은 접근으로 보인다. */
const WRAPPER_FIELD: Readonly<Record<string, string>> = {
	ParenthesisExpression: "expression",
	OptionalChainingExpression: "base",
	TsNonNullExpression: "expression",
	TsAsExpression: "expression",
	TsSatisfiesExpression: "expression",
};

function unwrap(value: unknown): unknown {
	let current = value;
	while (isRecord(current)) {
		const type = current.type;
		const field = typeof type === "string" ? WRAPPER_FIELD[type] : undefined;
		if (field === undefined) {
			break;
		}
		current = current[field];
	}
	return current;
}

function isIdentifier(value: unknown, name: string): boolean {
	const node = unwrap(value);
	return isNode<Identifier>(node, "Identifier") && node.value === name;
}

/** 이름이 정적으로 정해지는 키·속성(`a`·`"a"`·`["a"]`)의 이름. 변수·식으로 계산되는 키는 undefined. */
function staticName(key: unknown): string | undefined {
	if (
		isNode<Identifier>(key, "Identifier") ||
		isNode<StringLiteral>(key, "StringLiteral")
	) {
		return key.value;
	}
	if (isNode<ComputedPropName>(key, "Computed")) {
		const inner = unwrap(key.expression);
		return isNode<StringLiteral>(inner, "StringLiteral")
			? inner.value
			: undefined;
	}
	return undefined;
}

/** 전역 이름 `name` 을 가리키는 식인가 — `name` 또는 `globalThis.name`. 지역 변수 가림(스코프)은 보지 않는다. */
function isGlobal(value: unknown, name: string): boolean {
	const node = unwrap(value);
	if (isIdentifier(node, name)) {
		return true;
	}
	return (
		isNode<MemberExpression>(node, "MemberExpression") &&
		isIdentifier(node.object, "globalThis") &&
		staticName(node.property) === name
	);
}

/** 멤버 접근의 속성 이름과 그 속성 위치. */
function memberOf(
	value: unknown,
): { member: MemberExpression; name: string } | undefined {
	const node = unwrap(value);
	if (!isNode<MemberExpression>(node, "MemberExpression")) {
		return undefined;
	}
	const name = staticName(node.property);
	return name === undefined ? undefined : { member: node, name };
}

const isEnvOwner = (value: unknown): boolean =>
	isGlobal(value, "process") || isGlobal(value, "Bun");

// B9-env 갈래 ① — process.env·Bun.env·import.meta.env 멤버 접근(점·?.·["env"] 모두). 보고: 접근의 시작.
const envMember: Detector = (node) => {
	const access = memberOf(node);
	if (access === undefined || access.name !== "env") {
		return undefined;
	}
	const owner = unwrap(access.member.object);
	const isImportMeta =
		isNode<MetaProperty>(owner, "MetaProperty") && owner.kind === "import.meta";
	return isEnvOwner(owner) || isImportMeta
		? access.member.span.start
		: undefined;
};

/** 좌변 패턴과 우변이 짝지어지는 세 모양 — 선언(`const {..} = x`)·대입식(`({..} = x)`)·기본값(`f({..} = x)`). */
function bindingOf(
	node: AstNode,
): { target: unknown; source: unknown } | undefined {
	if (isNode<VariableDeclarator>(node, "VariableDeclarator")) {
		return { target: node.id, source: node.init };
	}
	if (
		isNode<AssignmentExpression>(node, "AssignmentExpression") &&
		node.operator === "="
	) {
		return { target: node.left, source: node.right };
	}
	if (isNode<AssignmentPattern>(node, "AssignmentPattern")) {
		return { target: node.left, source: node.right };
	}
	return undefined;
}

function hasEnvKey(property: unknown): boolean {
	return (
		(isNode<KeyValuePatternProperty>(property, "KeyValuePatternProperty") ||
			isNode<AssignmentPatternProperty>(
				property,
				"AssignmentPatternProperty",
			)) &&
		staticName(property.key) === "env"
	);
}

// B9-env 갈래 ② — process·Bun 을 구조분해해 최상위 키 env 를 꺼내는 표기. 보고: 패턴의 `{`.
const envDestructure: Detector = (node) => {
	const binding = bindingOf(node);
	if (binding === undefined || !isEnvOwner(binding.source)) {
		return undefined;
	}
	const pattern = binding.target;
	if (!isNode<ObjectPattern>(pattern, "ObjectPattern")) {
		return undefined;
	}
	return pattern.properties.some(hasEnvKey) ? pattern.span.start : undefined;
};

// B9-env 갈래 ③ — "bun" 에서 env 를 명명 임포트·재내보내기. 보고: 선언의 시작.
const bunEnvImport: Detector = (node) => {
	if (isNode<ImportDeclaration>(node, "ImportDeclaration")) {
		const named = node.specifiers.some(
			(specifier) =>
				isNode<NamedImportSpecifier>(specifier, "ImportSpecifier") &&
				staticName(specifier.imported ?? specifier.local) === "env",
		);
		return node.source.value === "bun" && named ? node.span.start : undefined;
	}
	if (isNode<ExportNamedDeclaration>(node, "ExportNamedDeclaration")) {
		const named = node.specifiers.some(
			(specifier) =>
				isNode<NamedExportSpecifier>(specifier, "ExportSpecifier") &&
				staticName(specifier.orig) === "env",
		);
		return node.source?.value === "bun" && named ? node.span.start : undefined;
	}
	return undefined;
};

/** 시간·난수를 읽는 전역 API — [객체, 속성]. */
const TIME_RANDOM_MEMBERS: readonly (readonly [string, string])[] = [
	["Date", "now"],
	["Math", "random"],
	["crypto", "randomUUID"],
	["crypto", "getRandomValues"],
	["performance", "now"],
	["Bun", "nanoseconds"],
];

// B2-time-random 갈래 ① — 위 API 의 멤버 접근(호출·참조 모두). 보고: 접근의 시작.
const timeRandomMember: Detector = (node) => {
	const access = memberOf(node);
	if (access === undefined) {
		return undefined;
	}
	const hit = TIME_RANDOM_MEMBERS.some(
		([owner, name]) =>
			access.name === name && isGlobal(access.member.object, owner),
	);
	return hit ? access.member.span.start : undefined;
};

// B2-time-random 갈래 ② — 인자 없는 `new Date`(괄호 생략 포함)와 `Date()`. 보고: 식의 시작.
const bareDate: Detector = (node) => {
	if (isNode<NewExpression>(node, "NewExpression")) {
		const noArguments = (node.arguments ?? []).length === 0;
		return isGlobal(node.callee, "Date") && noArguments
			? node.span.start
			: undefined;
	}
	if (isNode<CallExpression>(node, "CallExpression")) {
		const noArguments = node.arguments.length === 0;
		return isGlobal(node.callee, "Date") && noArguments
			? node.span.start
			: undefined;
	}
	return undefined;
};

/** 식의 맨 앞 조각 한 단계 아래 — 이어 붙이기의 왼쪽·멤버의 객체·호출의 피호출자. */
function leftChild(value: unknown): unknown {
	const node = unwrap(value);
	if (isNode<BinaryExpression>(node, "BinaryExpression")) {
		return node.left;
	}
	if (isNode<MemberExpression>(node, "MemberExpression")) {
		return node.object;
	}
	if (isNode<CallExpression>(node, "CallExpression")) {
		return node.callee;
	}
	return undefined;
}

/** 식이 문자열·템플릿 리터럴, 또는 `sql.raw(…)` 로 시작하는 체인인가 — 맨 앞 조각을 따라 내려가며 본다. */
function startsWithRawText(value: unknown): boolean {
	for (let node = unwrap(value); node !== undefined; node = leftChild(node)) {
		if (
			isNode<StringLiteral>(node, "StringLiteral") ||
			isNode<TemplateLiteral>(node, "TemplateLiteral")
		) {
			return true;
		}
		const access = memberOf(node);
		if (access?.name === "raw" && isIdentifier(access.member.object, "sql")) {
			return true;
		}
	}
	return false;
}

const WRITE_METHODS: ReadonlySet<string> = new Set([
	"insert",
	"update",
	"delete",
]);

// B11-write — 속성 insert·update·delete 의 호출, 그리고 첫 인자가 문자열·템플릿·sql.raw 인 execute 호출.
// 보고: 호출된 속성 이름이 있는 줄(포매터가 `.insert(` 를 다음 줄로 내려도 그 줄이다).
const writeCall: Detector = (node) => {
	if (!isNode<CallExpression>(node, "CallExpression")) {
		return undefined;
	}
	const access = memberOf(node.callee);
	if (access === undefined) {
		return undefined;
	}
	const isRawExecute =
		access.name === "execute" &&
		node.arguments.length > 0 &&
		startsWithRawText(node.arguments[0]?.expression);
	return WRITE_METHODS.has(access.name) || isRawExecute
		? access.member.property.span.start
		: undefined;
};

// B11-raw-sql 갈래 ① — sql 태그 템플릿(타입 인자 포함). 보고: 템플릿식의 시작.
const sqlTag: Detector = (node) =>
	isNode<TaggedTemplateExpression>(node, "TaggedTemplateExpression") &&
	isIdentifier(node.tag, "sql")
		? node.span.start
		: undefined;

// B11-raw-sql 갈래 ② — sql.raw(…) 호출. 보고: 호출의 시작.
const sqlRawCall: Detector = (node) => {
	if (!isNode<CallExpression>(node, "CallExpression")) {
		return undefined;
	}
	const access = memberOf(node.callee);
	return access?.name === "raw" && isIdentifier(access.member.object, "sql")
		? node.span.start
		: undefined;
};

/** 제품 소스 — apps·modules·packages 각 단위의 src. 시험(test)·scripts 는 정당하게 환경을 읽는다. */
export function isProductSource(path: string): boolean {
	return /^(apps|modules|packages)\/[^/]+\/src\//.test(path);
}

const RULES: readonly PurityRule[] = [
	{
		// 설정 우회 — 환경 접근은 packages/config 에서만(B9). 갈래는 모두 같은 접근의 다른 표기다:
		//   process.env·Bun.env·import.meta.env(?.·["env"] 포함) / { env } = process|Bun 구조분해 / bun 의 env 명명 임포트.
		// 미탐(한계): 이름공간·기본 임포트(import * as b from "bun" · import b from "bun")의 b.env, 별칭(const p = process),
		//   require("bun")·import("bun") 경유, 키를 변수로 계산하는 접근(process[k])은 AST 로도 못 잡는다 — 스코프·값 추적이 없다.
		//   process·Bun 이 지역 변수로 가려진 경우도 구별하지 않는다(같은 이름이면 잡는다).
		id: "B9-env",
		applies: (path) =>
			isProductSource(path) && !path.startsWith("packages/config/"),
		detectors: [envMember, envDestructure, bunEnvImport],
	},
	{
		// 시간·난수 직접 호출 금지(domain·service). 인자가 있는 new Date(value) 는 값 변환이라 대상이 아니다.
		// new Date 괄호 생략·Date() 와 performance.now·crypto.getRandomValues·Bun.nanoseconds 는 같은 계열의 다른 표기·API 다.
		// 미탐(한계): 객체가 전역 이름(또는 globalThis.이름)이 아닌 접근 — 별칭(const d = Date; d.now())·구조분해({ now } = Date)·
		//   다른 객체의 같은 이름 속성(x.Date.now())은 스코프·값 추적이 없어 잡지 않는다.
		id: "B2-time-random",
		applies: (path) => /^modules\/[^/]+\/src\/(domain|service)\//.test(path),
		detectors: [timeRandomMember, bareDate],
	},
	{
		// 쓰기는 adapter/postgres 안에서만(B11, ADR-025). Map·Set 의 같은 이름 메서드도 걸린다(객체를 따지지 않는다).
		// 쓰기 execute 는 첫 인자가 문자열·템플릿 리터럴이거나 sql.raw 로 시작하는 형태만 본다 — execute 전체를 막으면 usecase 의
		// handler.execute(cmd) 관례가 걸린다. 변수로 넘긴 SQL 은 값 추적이 없어 못 잡는다.
		id: "B11-write",
		applies: (path) =>
			isProductSource(path) && !path.includes("/adapter/postgres/"),
		detectors: [writeCall],
	},
	{
		// raw SQL 은 adapter/postgres/raw/ 에서만(ADR-025). Drizzle 기본값 sql`now()` 와 sql.raw( 도 걸린다.
		// 한계: 태그·객체가 식별자 sql 일 때만 본다 — db.sql`…` 나 별칭(const s = sql)은 잡지 않는다.
		id: "B11-raw-sql",
		applies: (path) =>
			isProductSource(path) && !path.includes("/adapter/postgres/raw/"),
		detectors: [sqlTag, sqlRawCall],
	},
];

/** 각 줄이 시작하는 위치(0부터, UTF-8 바이트 기준) — 오름차순이다. swc 의 span 이 바이트 단위라 문자 인덱스로 세면 한글 뒤에서 어긋난다. */
function lineStarts(bytes: Uint8Array): number[] {
	const starts = [0];
	for (let i = bytes.indexOf(0x0a); i !== -1; i = bytes.indexOf(0x0a, i + 1)) {
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

/** 확장자로 문법을 정한다 — .tsx 는 JSX 를 켠 TypeScript, .ts·.mts·.cts 는 TypeScript, 나머지는 JSX 를 켠 ECMAScript. */
function parserConfig(path: string): ParserConfig {
	if (path.endsWith(".tsx")) {
		return { syntax: "typescript", tsx: true };
	}
	if ([".ts", ".mts", ".cts"].some((extension) => path.endsWith(extension))) {
		return { syntax: "typescript" };
	}
	return { syntax: "ecmascript", jsx: true };
}

/** span 이 한 번의 파싱 안에서만 쓰이는 좌표라서, 파싱 결과와 그 좌표를 줄 번호로 바꾸는 함수를 한 쌍으로 만든다. */
function parseWithLines(
	path: string,
	text: string,
): { root: unknown; lineAt: (position: number) => number } {
	const bytes = new TextEncoder().encode(text);
	// swc 의 span 은 1부터 세는 UTF-8 바이트 위치인데, 같은 프로세스에서 파싱할 때 시작값이 달라질 수 있다(swc 1.15 에서는 호출마다 누적됐다).
	// 시작값을 가정하지 않으려고 끝에 표지 `;;` 를 붙여 그 위치로 기준을 구한다 — 앞에 붙이면 `#!` 셰뱅 파일이 파싱에 실패하고,
	// `;` 하나는 앞 문장의 세미콜론 자동 삽입에 먹혀 빈 문이 안 남을 수 있어 둘을 붙인다.
	let program: Module;
	try {
		program = parseSync(`${text}\n;;`, parserConfig(path));
	} catch (cause) {
		throw new Error(`${path}: 구문 분석에 실패했다`, { cause });
	}
	const marker = program.body.at(-1);
	if (marker?.type !== "EmptyStatement") {
		throw new Error(`${path}: 기준 위치 표지를 찾지 못했다`);
	}
	// 표지의 마지막 `;` 는 0부터 세어 bytes.length + 2 번째 바이트다(텍스트·개행·첫 `;` 뒤). span 은 거기에 1 이 더해진 값이다.
	const base = marker.span.start - (bytes.length + 2) - 1;
	const starts = lineStarts(bytes);
	return {
		root: program,
		lineAt: (position) => lineOf(starts, position - base - 1),
	};
}

/** 트리를 한 번 순회하며 모든 노드를 `visit` 에 준다 — 깊은 식에서 호출 스택이 넘치지 않게 명시 스택을 쓴다. */
function walk(root: unknown, visit: (node: AstNode) => void): void {
	const pending: unknown[] = [root];
	for (let value = pending.pop(); value !== undefined; value = pending.pop()) {
		if (Array.isArray(value)) {
			for (const item of value) {
				pending.push(item);
			}
		} else if (isRecord(value)) {
			if (isAstNode(value)) {
				visit(value);
			}
			for (const [key, child] of Object.entries(value)) {
				if (key !== "span" && typeof child === "object" && child !== null) {
					pending.push(child);
				}
			}
		}
	}
}

/**
 * 소스 텍스트 하나에서 규칙 위반을 찾는다. `path` 는 검사 루트 기준 상대 경로(슬래시 구분)다.
 * 한 줄에 같은 규칙이 여러 번 나와도 한 건이다. 구문 오류로 파싱할 수 없으면 경로를 담은 오류를 던진다 —
 * 빈 결과로 돌려주면 파싱되지 않는 파일이 조용히 통과한다.
 */
export function scanPurity(path: string, text: string): ArchViolation[] {
	const rules = RULES.filter((r) => r.applies(path));
	if (rules.length === 0) {
		return [];
	}
	const { root, lineAt } = parseWithLines(path, text);
	const found = new Map(rules.map((rule) => [rule, new Set<number>()]));
	walk(root, (node) => {
		for (const [rule, lines] of found) {
			for (const detect of rule.detectors) {
				const position = detect(node);
				if (position !== undefined) {
					lines.add(lineAt(position));
				}
			}
		}
	});
	const violations: ArchViolation[] = [];
	for (const [rule, lines] of found) {
		for (const line of [...lines].sort((a, b) => a - b)) {
			violations.push({ rule: rule.id, from: path, line });
		}
	}
	return violations;
}

/** 이 파일이 낼 수 있는 위반 ID — 규칙 목록과 시험 기대 표의 대응을 확인하는 데 쓴다. */
export const PURITY_RULE_IDS: readonly string[] = RULES.map((rule) => rule.id);
