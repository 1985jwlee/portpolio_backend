// 마이그레이션 격리 검사(B14 SQL 절) — 모듈의 마이그레이션 SQL 이 다른 모듈의 스키마 객체를 참조하지 않는지 본다(ADR-052 결정 7, S1-18).
// 모듈은 자기 마이그레이션을 소유하고(modules/<m>/migrations), 적용 순서가 결과에 영향을 주지 않으려면 다른 모듈의 표·함수·트리거를 참조하면 안 된다.
// 판정(judgeMigrationIsolation)은 파일을 읽지 않는 순수 함수이고, 파일을 읽는 일은 loadMigrationFiles 가 한다(check-classification.ts 와 같은 분리).
//
// 방법: 주석·문자열 리터럴을 공백으로 지우고(줄바꿈은 남겨 줄번호를 보존한다) `<스키마>.<객체>` 로 한정된 이름의 스키마가
// 이 모듈의 스키마(디렉토리 이름 = 스키마 이름)·`public`·`pg_catalog`·`information_schema`·`pf_migrations` 가 아니면 위반이다.
//
// 한계(놓치는 쪽 셋, 오탐 쪽 둘):
//  - 한정하지 않은 이름(`FROM items`)은 `search_path` 에 달려 있어 못 본다. 모듈 SQL 은 항상 한정 이름을 쓴다는 관례에 기댄다.
//  - 동적 SQL 로 조립한 이름(`EXECUTE format(...)`)은 못 본다.
//  - 오탐: 표 별칭·레코드 변수의 열 참조(`x.id`)도 한정 이름처럼 보인다. `NEW`·`OLD`·`EXCLUDED` 만 예외로 둔다.
//  - `$$ … $$` 달러 인용은 코드로 본다(함수 본문은 코드다) — 그 안의 일반 텍스트에 `a.b` 가 있으면 오탐이다.
//  - `CREATE SCHEMA <다른 모듈>` 처럼 한정 이름이 아닌 선언은 보지 않는다.
// 종료 코드: 0 위반 없음 · 1 위반 있음. 출력은 arch.ts 와 같은 `<규칙> <경로>:<줄> (<사유>)` 줄 + 요약 한 줄.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type MigrationFile = {
	readonly module: string;
	/** 검사 루트 기준 경로(`/` 구분). */
	readonly path: string;
	readonly sql: string;
};

export type IsolationViolation = {
	readonly rule: string;
	readonly path: string;
	readonly line: number;
	readonly detail: string;
};

export const ISOLATION_RULE_IDS: readonly string[] = ["MS-foreign-schema"];

/** 어느 모듈이든 참조해도 되는 스키마. */
const SHARED_SCHEMAS: ReadonlySet<string> = new Set([
	"public",
	"pg_catalog",
	"information_schema",
	"pf_migrations",
]);
/** 트리거 함수·`ON CONFLICT` 가 쓰는 가상 관계 — 스키마가 아니라서 한정 이름처럼 보여도 통과시킨다. */
const PSEUDO_RELATIONS: ReadonlySet<string> = new Set([
	"new",
	"old",
	"excluded",
]);

const IDENT = String.raw`"(?:[^"]|"")+"|[\p{L}_][\p{L}\p{N}_$]*`;
const QUALIFIED = new RegExp(
	String.raw`(?<![\p{L}\p{N}_$."])(?:${IDENT})(?:\s*\.\s*(?:${IDENT}))+`,
	"gu",
);
const IDENT_ONLY = new RegExp(IDENT, "gu");
const DOLLAR_TAG = /\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/uy;
const IDENT_CHAR = /[\p{L}\p{N}_$]/u;

/** 줄바꿈은 남기고 나머지를 공백으로 바꾼다. */
function blank(text: string): string {
	return text.replace(/[^\n]/g, " ");
}

/**
 * 주석(`-- …`·중첩되는 `/* … *\/`)과 문자열 리터럴(`'…'`·`E'…'`)을 공백으로 지운다. 줄바꿈과 길이는 보존한다.
 * 큰따옴표 식별자(`"…"`)는 그대로 둔다 — 그 안의 `--` 가 주석으로 읽히지 않게 통째로 건너뛴다. `$tag$` 구분자는 지우고 본문은 코드로 둔다.
 */
export function stripSql(sql: string): string {
	let out = "";
	let i = 0;
	while (i < sql.length) {
		const char = sql.charAt(i);
		const prev = i > 0 ? sql.charAt(i - 1) : "";
		if (char === "-" && sql.charAt(i + 1) === "-") {
			const end = sql.indexOf("\n", i);
			const stop = end === -1 ? sql.length : end;
			out += blank(sql.slice(i, stop));
			i = stop;
		} else if (char === "/" && sql.charAt(i + 1) === "*") {
			// PostgreSQL 의 블록 주석은 중첩된다.
			let depth = 1;
			let j = i + 2;
			while (j < sql.length && depth > 0) {
				if (sql.startsWith("/*", j)) {
					depth += 1;
					j += 2;
				} else if (sql.startsWith("*/", j)) {
					depth -= 1;
					j += 2;
				} else {
					j += 1;
				}
			}
			out += blank(sql.slice(i, j));
			i = j;
		} else if (char === "'") {
			// E'…' 만 백슬래시 이스케이프를 쓴다. 그 밖의 인용은 '' 로만 이스케이프한다.
			const escapeString =
				/^[eE]$/.test(prev) && !IDENT_CHAR.test(sql.charAt(i - 2));
			let j = i + 1;
			while (j < sql.length) {
				if (escapeString && sql.charAt(j) === "\\") {
					j += 2;
				} else if (sql.startsWith("''", j)) {
					j += 2;
				} else if (sql.charAt(j) === "'") {
					j += 1;
					break;
				} else {
					j += 1;
				}
			}
			out += blank(sql.slice(i, j));
			i = j;
		} else if (char === '"') {
			let j = i + 1;
			while (j < sql.length) {
				if (sql.startsWith('""', j)) {
					j += 2;
				} else if (sql.charAt(j) === '"') {
					j += 1;
					break;
				} else {
					j += 1;
				}
			}
			out += sql.slice(i, j);
			i = j;
		} else if (char === "$" && !IDENT_CHAR.test(prev)) {
			DOLLAR_TAG.lastIndex = i;
			const tag = DOLLAR_TAG.exec(sql)?.[0];
			if (tag === undefined) {
				out += char;
				i += 1;
			} else {
				out += blank(tag);
				i += tag.length;
			}
		} else {
			out += char;
			i += 1;
		}
	}
	return out;
}

/** 큰따옴표 식별자는 따옴표를 벗겨 그대로, 아니면 소문자로 접는다(PostgreSQL 의 접기 규칙). */
function normalizeIdent(raw: string): string {
	return raw.startsWith('"')
		? raw.slice(1, -1).replaceAll('""', '"')
		: raw.toLowerCase();
}

export type SqlReference = {
	readonly schema: string;
	readonly object: string;
	readonly line: number;
};

/** 지운 SQL 에서 `<스키마>.<객체>…` 로 한정된 이름을 모은다. 세 조각 이상이면 첫 조각을 스키마로 본다. */
export function qualifiedReferences(sql: string): SqlReference[] {
	const stripped = stripSql(sql);
	const references: SqlReference[] = [];
	for (const match of stripped.matchAll(QUALIFIED)) {
		const parts = [...match[0].matchAll(IDENT_ONLY)].map((m) =>
			normalizeIdent(m[0]),
		);
		const [schema, object] = parts;
		if (schema === undefined || object === undefined) {
			continue;
		}
		const line = stripped.slice(0, match.index).split("\n").length;
		references.push({ schema, object, line });
	}
	return references;
}

/** 파일마다 위반을 가린다. 파일을 읽지 않는다. */
export function judgeMigrationIsolation(
	files: ReadonlyArray<MigrationFile>,
): IsolationViolation[] {
	const violations: IsolationViolation[] = [];
	for (const file of files) {
		for (const ref of qualifiedReferences(file.sql)) {
			if (
				ref.schema === file.module ||
				SHARED_SCHEMAS.has(ref.schema) ||
				PSEUDO_RELATIONS.has(ref.schema)
			) {
				continue;
			}
			violations.push({
				rule: "MS-foreign-schema",
				path: file.path,
				line: ref.line,
				detail: `다른 스키마의 ${ref.schema}.${ref.object} 를 참조한다 — 이 모듈의 스키마는 ${file.module}`,
			});
		}
	}
	return violations;
}

/** `<root>/modules/<m>/migrations/*.sql` 을 읽는다(하위 폴더 제외). */
export function loadMigrationFiles(root: string): MigrationFile[] {
	const modulesDir = `${root}/modules`;
	if (!existsSync(modulesDir)) {
		return [];
	}
	const files: MigrationFile[] = [];
	const modules = readdirSync(modulesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	for (const module of modules) {
		const dir = `${modulesDir}/${module}/migrations`;
		if (!existsSync(dir)) {
			continue;
		}
		const names = readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
			.map((entry) => entry.name)
			.sort();
		for (const name of names) {
			files.push({
				module,
				path: `modules/${module}/migrations/${name}`,
				sql: readFileSync(`${dir}/${name}`, "utf8"),
			});
		}
	}
	return files;
}

export function formatViolation(v: IsolationViolation): string {
	return `${v.rule} ${v.path}:${v.line} (${v.detail})`;
}

if (import.meta.main) {
	const root = (
		process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url))
	).replace(/[\\/]$/, "");
	const files = loadMigrationFiles(root);
	const violations = judgeMigrationIsolation(files);
	for (const violation of violations) {
		console.log(formatViolation(violation));
	}
	const modules = new Set(files.map((f) => f.module)).size;
	console.log(
		files.length === 0
			? "check:migration-isolation: 검사 대상 0 (마이그레이션 SQL 없음)"
			: `check:migration-isolation: 모듈 ${modules} · 파일 ${files.length} · 위반 ${violations.length}`,
	);
	process.exitCode = violations.length === 0 ? 0 : 1;
}
