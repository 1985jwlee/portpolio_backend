// 컬럼 보호 등급 검사 — 모듈의 Drizzle 스키마(schema.ts)의 모든 컬럼이 등급 맵(classification.ts)에 있는지 대조한다.
// 판정(checkClassification)은 파일을 읽지 않는 순수 함수이고, 모듈 파일을 읽어 판정 입력으로 바꾸는 일은 loadModules 가 한다
// (check-cqrs.ts 와 arch.ts 의 분리와 같은 모양). 정본: docs/domains/database-schema.md §9 "검사", ADR-026, AC-024.
//
// 한계: 정적 호출 경로 검사(ENC 컬럼에 FieldCipher 를 거치지 않고 쓰는 코드)는 하지 않는다 — 문서에 수단이 없다.
// ENC 는 이름 규칙(`_enc` 접미, 같은 표에 접미 없는 동명 평문 컬럼 없음)으로 "평문 컬럼이 없음을 스키마가 보장"하게만 기계화한다.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

/** 보호 등급 — 이 파일이 정본이다. 모듈의 classification.ts 가 `satisfies` 로 이 타입을 쓴다. */
export const GRADES = ["PUB", "SYS", "PSD", "PII", "HSH", "ENC"] as const;
export type Grade = (typeof GRADES)[number];
/** 표 이름 → 컬럼 이름 → 등급. */
export type ClassificationMap = Record<string, Record<string, Grade>>;

export const CLASSIFICATION_RULE_IDS: readonly string[] = [
	"CLS-no-classification-file",
	"CLS-invalid-shape",
	"CLS-invalid-grade",
	"CLS-unclassified-column",
	"CLS-unknown-entry",
	"CLS-enc-naming",
];

export type ClassificationViolation = {
	readonly rule: string;
	readonly module: string;
	readonly table?: string;
	readonly column?: string;
	readonly detail?: string;
};

export type ModuleInput = {
	readonly module: string;
	/** schema.ts 가 있으면 표 이름 → 컬럼 이름 집합. 없으면 undefined(이 모듈은 대상이 아니다). */
	readonly tables: ReadonlyMap<string, ReadonlySet<string>> | undefined;
	/** classification.ts 가 있는지. */
	readonly hasClassificationFile: boolean;
	/** classification.ts 의 `classification` 내보내기(검증 전). 내보내기가 없으면 undefined. */
	readonly classification: unknown;
};

const GRADE_SET: ReadonlySet<string> = new Set(GRADES);
const ENC_SUFFIX = "_enc";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGrade(value: unknown): value is Grade {
	return typeof value === "string" && GRADE_SET.has(value);
}

/** 맵의 형식을 검증해 쓸 수 있는 부분만 돌려준다. 형식이 틀린 자리는 위반으로 올리고 건너뛴다. */
function parseMap(
	module: string,
	raw: unknown,
	violations: ClassificationViolation[],
): Map<string, Map<string, Grade>> {
	const tables = new Map<string, Map<string, Grade>>();
	if (!isRecord(raw)) {
		violations.push({
			rule: "CLS-invalid-shape",
			module,
			detail: "classification 내보내기가 없거나 객체가 아니다",
		});
		return tables;
	}
	for (const [table, columns] of Object.entries(raw)) {
		if (!isRecord(columns)) {
			violations.push({
				rule: "CLS-invalid-shape",
				module,
				table,
				detail: "표 항목이 컬럼 → 등급 객체가 아니다",
			});
			continue;
		}
		const parsed = new Map<string, Grade>();
		for (const [column, grade] of Object.entries(columns)) {
			if (isGrade(grade)) {
				parsed.set(column, grade);
			} else {
				violations.push({
					rule: "CLS-invalid-grade",
					module,
					table,
					column,
					detail: `허용 등급(${GRADES.join("·")})이 아니다`,
				});
			}
		}
		tables.set(table, parsed);
	}
	return tables;
}

function checkEncNaming(
	module: string,
	table: string,
	columns: ReadonlyMap<string, Grade>,
	schemaColumns: ReadonlySet<string>,
	violations: ClassificationViolation[],
): void {
	for (const [column, grade] of columns) {
		if (grade !== "ENC") {
			continue;
		}
		if (!column.endsWith(ENC_SUFFIX)) {
			violations.push({
				rule: "CLS-enc-naming",
				module,
				table,
				column,
				detail: `ENC 컬럼 이름은 ${ENC_SUFFIX} 로 끝나야 한다`,
			});
			continue;
		}
		const plain = column.slice(0, -ENC_SUFFIX.length);
		if (schemaColumns.has(plain)) {
			violations.push({
				rule: "CLS-enc-naming",
				module,
				table,
				column,
				detail: `같은 표에 접미 없는 동명 컬럼(${plain})이 있다 — 평문 컬럼이 남는다`,
			});
		}
	}
}

export function checkClassification(
	modules: ReadonlyArray<ModuleInput>,
): ClassificationViolation[] {
	const violations: ClassificationViolation[] = [];
	for (const input of modules) {
		const { module, tables: schemaTables } = input;
		if (schemaTables === undefined) {
			continue;
		}
		if (!input.hasClassificationFile) {
			violations.push({
				rule: "CLS-no-classification-file",
				module,
				detail: "schema.ts 는 있는데 classification.ts 가 없다",
			});
			continue;
		}
		const map = parseMap(module, input.classification, violations);
		// 형식이 깨진 맵은 이미 위반으로 올렸다 — 같은 원인으로 모든 컬럼을 미분류로 쏟지 않는다.
		if (!isRecord(input.classification)) {
			continue;
		}

		for (const [table, schemaColumns] of schemaTables) {
			const columns = map.get(table);
			for (const column of schemaColumns) {
				if (columns?.has(column) !== true) {
					violations.push({
						rule: "CLS-unclassified-column",
						module,
						table,
						column,
					});
				}
			}
			if (columns !== undefined) {
				checkEncNaming(module, table, columns, schemaColumns, violations);
			}
		}
		for (const [table, columns] of map) {
			const schemaColumns = schemaTables.get(table);
			if (schemaColumns === undefined) {
				violations.push({
					rule: "CLS-unknown-entry",
					module,
					table,
					detail: "스키마에 없는 표다",
				});
				continue;
			}
			for (const column of columns.keys()) {
				if (!schemaColumns.has(column)) {
					violations.push({
						rule: "CLS-unknown-entry",
						module,
						table,
						column,
						detail: "스키마에 없는 컬럼이다",
					});
				}
			}
		}
	}
	return violations;
}

const SCHEMA_FILE = "src/adapter/postgres/schema.ts";
const CLASSIFICATION_FILE = "src/adapter/postgres/classification.ts";

/** schema.ts 가 내보낸 Drizzle 표를 표 이름 → 컬럼 이름 집합으로 바꾼다(DB 컬럼 이름 기준). */
function tablesOf(
	schemaExports: Record<string, unknown>,
): Map<string, Set<string>> {
	const tables = new Map<string, Set<string>>();
	for (const value of Object.values(schemaExports)) {
		if (is(value, PgTable)) {
			const names = Object.values(getTableColumns(value)).map((c) => c.name);
			tables.set(getTableName(value), new Set(names));
		}
	}
	return tables;
}

async function importModule(path: string): Promise<Record<string, unknown>> {
	return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
}

/**
 * `<root>/modules/<m>/src/adapter/postgres/{schema,classification}.ts` 를 읽는다.
 * 경로를 계산해 동적으로 임포트하므로 정적 간선이 생기지 않는다(B4·B6 와 무관).
 */
export async function loadModules(root: string): Promise<ModuleInput[]> {
	const modulesDir = `${root}/modules`;
	// modules/ 가 없는 루트는 대상이 0개다.
	if (!existsSync(modulesDir)) {
		return [];
	}
	const names = readdirSync(modulesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	const inputs: ModuleInput[] = [];
	for (const module of names) {
		const schemaPath = `${modulesDir}/${module}/${SCHEMA_FILE}`;
		const classificationPath = `${modulesDir}/${module}/${CLASSIFICATION_FILE}`;
		const hasSchema = await Bun.file(schemaPath).exists();
		const hasClassification = await Bun.file(classificationPath).exists();
		if (!hasSchema && !hasClassification) {
			continue;
		}
		inputs.push({
			module,
			tables: hasSchema ? tablesOf(await importModule(schemaPath)) : undefined,
			hasClassificationFile: hasClassification,
			classification: hasClassification
				? (await importModule(classificationPath)).classification
				: undefined,
		});
	}
	return inputs;
}

export function formatViolation(v: ClassificationViolation): string {
	const where = [v.module, v.table, v.column]
		.filter((part) => part !== undefined)
		.join(".");
	return v.detail === undefined
		? `${v.rule} ${where}`
		: `${v.rule} ${where} (${v.detail})`;
}

if (import.meta.main) {
	const root =
		process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url));
	const inputs = await loadModules(root.replace(/[\\/]$/, ""));
	const targets = inputs.filter((i) => i.tables !== undefined);
	const violations = checkClassification(inputs);
	for (const violation of violations) {
		console.log(formatViolation(violation));
	}
	if (targets.length === 0) {
		console.log(
			"check:classification: 검사 대상 0 (schema.ts 를 가진 모듈 없음)",
		);
	} else {
		console.log(
			`check:classification: 모듈 ${targets.length} · 위반 ${violations.length}`,
		);
	}
	process.exitCode = violations.length === 0 ? 0 : 1;
}
