// B3(CQRS) 판정 — 그래프 간선과 선언을 받아 위반을 돌려주는 순수 함수다(파일을 읽지 않는다).
// 포트의 종류(쓰기/읽기)는 파일명이 아니라 그 포트가 건드리는 스키마 표로 정하고,
// 그 선언을 modules/<m>/port-kinds.json 에 둔다(docs/design/01-repository-structure.md §5 B3).
// S1-5 는 선언의 형식·정합과 usecase 방향까지 본다. 어댑터가 실제로 건드리는 표와 선언의 대조는
// 첫 모듈 스키마 작업(S2-1)이 이어받는다. 실행은 `bun run arch` 로만 한다(scripts/arch.ts).
import type { ArchViolation } from "./arch.ts";

export type CqrsInput = {
	/** dependency-cruiser 가 해석한 로컬 간선(검사 루트 기준 상대 경로). */
	readonly edges: ReadonlyArray<{ readonly from: string; readonly to: string }>;
	/** 실제로 본 로컬 소스 — 선언한 포트 파일이 여기 있어야 한다. */
	readonly files: ReadonlySet<string>;
	/**
	 * 키는 모듈 디렉토리명, 값은 그 modules/<m>/port-kinds.json 을 파싱한 값(검증 전).
	 * 파일이 없으면 키가 없고, 파싱에 실패했으면 값이 null 이다.
	 */
	readonly declarations: ReadonlyMap<string, unknown>;
	/** modules/cqrs-exceptions.json 파싱 값. 파일이 없으면 undefined, 파싱 실패면 null. */
	readonly exceptions: unknown;
};

/** 이 파일이 낼 수 있는 위반 ID — 시험 기대 표와의 대응을 확인하는 데 쓴다. */
export const CQRS_RULE_IDS: readonly string[] = [
	"B3-declaration",
	"B3-undeclared-port",
	"B3-command-read",
	"B3-query-write",
];

const EXCEPTIONS_PATH = "modules/cqrs-exceptions.json";
const USECASE_PATH = /^modules\/([^/]+)\/src\/usecase\/(command|query)\//;

type Kind = "write" | "read";
type PortDecl = { readonly kind: Kind; readonly tables: readonly string[] };
type PortEntry = PortDecl | "broken";
type Exception = { readonly reader: string; readonly schemaObject: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function declViolation(
	from: string,
	detail: string,
	to?: string,
): ArchViolation {
	return to === undefined
		? { rule: "B3-declaration", from, detail }
		: { rule: "B3-declaration", from, to, detail };
}

/** 예외 목록을 읽는다. 형식이 틀린 항목은 위반으로 올리고 건너뛴다. */
function parseExceptions(raw: unknown): {
	exceptions: Exception[];
	violations: ArchViolation[];
} {
	if (raw === undefined) {
		return { exceptions: [], violations: [] };
	}
	if (!isRecord(raw) || !Array.isArray(raw.exceptions)) {
		return {
			exceptions: [],
			violations: [
				declViolation(
					EXCEPTIONS_PATH,
					"최상위 객체의 exceptions 배열이 필요하다",
				),
			],
		};
	}
	const exceptions: Exception[] = [];
	const violations: ArchViolation[] = [];
	raw.exceptions.forEach((entry: unknown, index) => {
		if (
			isRecord(entry) &&
			typeof entry.id === "string" &&
			typeof entry.reader === "string" &&
			typeof entry.schemaObject === "string"
		) {
			exceptions.push({
				reader: entry.reader,
				schemaObject: entry.schemaObject,
			});
			return;
		}
		violations.push(
			declViolation(
				EXCEPTIONS_PATH,
				`exceptions[${index}] 는 { id, reader, schemaObject } 문자열 셋이어야 한다`,
			),
		);
	});
	return { exceptions, violations };
}

function isCovered(
	exceptions: readonly Exception[],
	readers: readonly string[],
	table: string,
): boolean {
	return exceptions.some(
		(e) => e.schemaObject === table && readers.includes(e.reader),
	);
}

/** 포트 선언 하나를 구조만 읽는다. 구조가 틀리면 사유를 돌려준다. */
function parsePortDecl(raw: unknown): PortDecl | string {
	if (!isRecord(raw)) {
		return "포트 선언은 { kind, tables } 객체여야 한다";
	}
	const { kind, tables } = raw;
	if (kind !== "write" && kind !== "read") {
		return 'kind 는 "write" 또는 "read" 여야 한다';
	}
	if (
		!Array.isArray(tables) ||
		tables.length === 0 ||
		!tables.every((t): t is string => typeof t === "string")
	) {
		return "tables 는 비지 않은 문자열 배열이어야 한다";
	}
	return { kind, tables };
}

/** 포트 선언의 의미 정합 — 표의 스키마와 kind 가 맞는가. */
function checkPortSemantics(
	module: string,
	declPath: string,
	portFile: string,
	decl: PortDecl,
	exceptions: readonly Exception[],
): ArchViolation[] {
	const violations: ArchViolation[] = [];
	const writeSchema = module;
	const readSchema = `${module}_read`;
	for (const table of decl.tables) {
		const parts = table.split(".");
		const schema = parts[0];
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			violations.push(
				declViolation(
					declPath,
					`표 "${table}" 는 <스키마>.<표> 형식이어야 한다`,
					portFile,
				),
			);
		} else if (schema !== writeSchema && schema !== readSchema) {
			violations.push(
				declViolation(
					declPath,
					`표 "${table}" 의 스키마는 ${writeSchema} 또는 ${readSchema} 여야 한다`,
					portFile,
				),
			);
		}
	}
	if (decl.kind === "read") {
		for (const table of decl.tables) {
			const isWriteTable = table.split(".")[0] === writeSchema;
			if (isWriteTable && !isCovered(exceptions, [portFile], table)) {
				violations.push(
					declViolation(
						declPath,
						`읽기 포트가 쓰기 스키마 표 "${table}" 를 선언했다(예외 등록 없음)`,
						portFile,
					),
				);
			}
		}
	} else if (!decl.tables.some((t) => t.split(".")[0] === writeSchema)) {
		violations.push(
			declViolation(
				declPath,
				`쓰기 포트는 ${writeSchema} 스키마 표를 하나 이상 선언해야 한다`,
				portFile,
			),
		);
	}
	return violations;
}

/** 모듈 하나의 port-kinds.json 을 검증하고 포트 선언 표를 돌려준다. */
function parseModuleDeclaration(
	module: string,
	raw: unknown,
	files: ReadonlySet<string>,
	exceptions: readonly Exception[],
): { ports: Map<string, PortEntry> | "broken"; violations: ArchViolation[] } {
	const declPath = `modules/${module}/port-kinds.json`;
	if (module.endsWith("-contract")) {
		return {
			ports: "broken",
			violations: [
				declViolation(
					declPath,
					"계약 패키지(-contract)에는 포트 선언을 두지 않는다",
				),
			],
		};
	}
	if (!isRecord(raw) || !isRecord(raw.ports)) {
		return {
			ports: "broken",
			violations: [
				declViolation(
					declPath,
					"파싱할 수 없거나 최상위 객체의 ports 객체가 없다",
				),
			],
		};
	}
	const ports = new Map<string, PortEntry>();
	const violations: ArchViolation[] = [];
	for (const [relativePath, rawDecl] of Object.entries(raw.ports)) {
		const portFile = `modules/${module}/${relativePath}`;
		const parsed = parsePortDecl(rawDecl);
		if (typeof parsed === "string") {
			violations.push(declViolation(declPath, parsed, portFile));
			ports.set(portFile, "broken");
			continue;
		}
		ports.set(portFile, parsed);
		violations.push(
			...checkPortSemantics(module, declPath, portFile, parsed, exceptions),
		);
		if (!files.has(portFile)) {
			violations.push(
				declViolation(
					declPath,
					"선언한 포트 파일이 검사 결과에 없다",
					portFile,
				),
			);
		}
	}
	return { ports, violations };
}

/** usecase 하나가 포트 하나를 쓰는 간선의 방향을 판정한다. */
function checkDirection(
	usecase: string,
	direction: "command" | "query",
	portFile: string,
	decl: PortDecl,
	exceptions: readonly Exception[],
): ArchViolation | undefined {
	const forbiddenKind: Kind = direction === "command" ? "read" : "write";
	if (decl.kind !== forbiddenKind) {
		return undefined;
	}
	// 걸린 표를 모두 예외가 덮어야 통과한다(usecase 또는 포트가 reader 로 등재).
	const allCovered = decl.tables.every((table) =>
		isCovered(exceptions, [usecase, portFile], table),
	);
	if (allCovered) {
		return undefined;
	}
	return {
		rule: direction === "command" ? "B3-command-read" : "B3-query-write",
		from: usecase,
		to: portFile,
	};
}

export function checkCqrs(input: CqrsInput): ArchViolation[] {
	const { exceptions, violations } = parseExceptions(input.exceptions);

	const modules = new Map<string, Map<string, PortEntry> | "broken">();
	for (const [module, raw] of input.declarations) {
		const parsed = parseModuleDeclaration(module, raw, input.files, exceptions);
		modules.set(module, parsed.ports);
		violations.push(...parsed.violations);
	}

	const seen = new Set<string>();
	for (const { from, to } of input.edges) {
		const match = USECASE_PATH.exec(from);
		const module = match?.[1];
		const direction = match?.[2];
		if (
			module === undefined ||
			(direction !== "command" && direction !== "query") ||
			!to.startsWith(`modules/${module}/src/port/`)
		) {
			continue;
		}
		const key = `${from}\0${to}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		const ports = modules.get(module);
		if (ports === "broken") {
			// 선언 파일 자체가 이미 위반으로 올라갔다 — 같은 원인을 한 번 더 내지 않는다.
			continue;
		}
		const entry = ports?.get(to);
		if (entry === "broken") {
			continue;
		}
		if (entry === undefined) {
			violations.push({ rule: "B3-undeclared-port", from, to });
			continue;
		}
		const violation = checkDirection(from, direction, to, entry, exceptions);
		if (violation !== undefined) {
			violations.push(violation);
		}
	}
	return violations;
}
