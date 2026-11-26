import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	ISOLATION_RULE_IDS,
	type IsolationViolation,
	judgeMigrationIsolation,
	loadMigrationFiles,
	qualifiedReferences,
	stripSql,
} from "./check-migration-isolation.ts";

const FIXTURES = fileURLToPath(
	new URL("./fixtures/migration-isolation/", import.meta.url),
);
const PASSING = `${FIXTURES}passing`;
const VIOLATING = `${FIXTURES}violating`;
const REPO = fileURLToPath(new URL("../", import.meta.url)).replace(
	/[\\/]$/,
	"",
);
const SCRIPT = fileURLToPath(
	new URL("./check-migration-isolation.ts", import.meta.url),
);

function summary(violations: IsolationViolation[]): string[] {
	return violations.map((v) => `${v.path}:${v.line} ${v.detail}`);
}

function judgeSql(module: string, sql: string): IsolationViolation[] {
	return judgeMigrationIsolation([
		{ module, path: `modules/${module}/migrations/0000.sql`, sql },
	]);
}

function run(root: string): { code: number; out: string } {
	const child = Bun.spawnSync([process.execPath, SCRIPT, root], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: child.exitCode, out: child.stdout.toString() };
}

describe("픽스처 루트", () => {
	test("통과 루트: 자기 스키마·public·pg_catalog·information_schema·pf_migrations 와 주석·문자열 안의 이름은 위반이 아니다", () => {
		const files = loadMigrationFiles(PASSING);
		expect(files.map((f) => f.path)).toEqual([
			"modules/alpha/migrations/0000_init.sql",
		]);
		expect(judgeMigrationIsolation(files)).toEqual([]);
	});

	test("위반 루트: 타 모듈 스키마 참조를 줄번호와 함께 모두 낸다", () => {
		const violations = judgeMigrationIsolation(loadMigrationFiles(VIOLATING));
		expect(summary(violations)).toEqual([
			"modules/alpha/migrations/0001_fk.sql:3 다른 스키마의 beta.items 를 참조한다 — 이 모듈의 스키마는 alpha",
			"modules/alpha/migrations/0001_fk.sql:7 다른 스키마의 beta.items 를 참조한다 — 이 모듈의 스키마는 alpha",
			"modules/alpha/migrations/0001_fk.sql:11 다른 스키마의 gamma.rows 를 참조한다 — 이 모듈의 스키마는 alpha",
			"modules/gamma/migrations/0000_view.sql:1 다른 스키마의 alpha.link 를 참조한다 — 이 모듈의 스키마는 gamma",
		]);
		expect(new Set(violations.map((v) => v.rule))).toEqual(
			new Set(ISOLATION_RULE_IDS),
		);
	});

	test("마이그레이션 폴더가 없는 루트는 대상이 0 이다", () => {
		expect(loadMigrationFiles(`${FIXTURES}no-such-root`)).toEqual([]);
	});
});

describe("SQL 읽기", () => {
	test("주석 안의 한정 이름은 무시한다(줄 주석·중첩 블록 주석)", () => {
		expect(judgeSql("a", "-- b.t\n/* b.t /* c.t */ d.t */ SELECT 1;")).toEqual(
			[],
		);
	});

	test("문자열 리터럴 안의 한정 이름은 무시한다('' 와 E'\\'' 이스케이프 포함)", () => {
		expect(judgeSql("a", "SELECT 'b.t', 'it''s b.t', E'x\\'b.t';")).toEqual([]);
	});

	test("문자열을 닫은 뒤의 한정 이름은 본다", () => {
		expect(summary(judgeSql("a", "SELECT 'x' FROM b.t;"))).toEqual([
			"modules/a/migrations/0000.sql:1 다른 스키마의 b.t 를 참조한다 — 이 모듈의 스키마는 a",
		]);
	});

	test("큰따옴표 식별자 안의 --·따옴표는 주석·문자열로 읽지 않고 이름은 본다", () => {
		expect(qualifiedReferences('SELECT * FROM "b--x"."t";')).toEqual([
			{ schema: "b--x", object: "t", line: 1 },
		]);
		expect(qualifiedReferences('SELECT * FROM "it\'s"."t";')).toEqual([
			{ schema: "it's", object: "t", line: 1 },
		]);
	});

	test("따옴표 없는 이름은 소문자로 접고 따옴표 있는 이름은 그대로 비교한다", () => {
		expect(judgeSql("a", 'SELECT 1 FROM A.t, "a".t;')).toEqual([]);
		expect(summary(judgeSql("a", 'SELECT 1 FROM "A".t;'))).toHaveLength(1);
	});

	test("점 주위의 공백·줄바꿈이 있어도 한정 이름으로 읽고 줄번호는 이름이 시작한 줄이다", () => {
		expect(qualifiedReferences("SELECT 1\nFROM b\n  .\n  t;")).toEqual([
			{ schema: "b", object: "t", line: 2 },
		]);
	});

	test("달러 인용 본문은 코드로 읽는다 — 안의 타 스키마 참조를 잡는다", () => {
		expect(
			qualifiedReferences("DO $do$\nBEGIN\n  DELETE FROM b.t;\nEND $do$;"),
		).toEqual([{ schema: "b", object: "t", line: 3 }]);
	});

	test("NEW·OLD·EXCLUDED 와 숫자 소수점은 한정 이름이 아니다", () => {
		expect(
			judgeSql("a", "SELECT NEW.id, old.id, EXCLUDED.id, 1.5, x1.5e;"),
		).toEqual([]);
	});

	test("stripSql 은 줄바꿈과 길이를 보존한다", () => {
		const sql = "a -- c\n/* x\ny */ 'z\nw' b";
		const stripped = stripSql(sql);
		expect(stripped).toHaveLength(sql.length);
		expect(stripped.split("\n")).toHaveLength(sql.split("\n").length);
		expect(stripped.replaceAll(/\s+/g, "")).toBe("ab");
	});

	test("한정하지 않은 이름과 CREATE SCHEMA 는 보지 않는다(알려진 한계)", () => {
		expect(judgeSql("a", "CREATE SCHEMA other;\nSELECT * FROM items;")).toEqual(
			[],
		);
	});
});

describe("명령줄", () => {
	test("통과 루트는 종료 0", () => {
		const result = run(PASSING);
		expect(result.code).toBe(0);
		expect(result.out).toContain("모듈 1 · 파일 1 · 위반 0");
	});

	test("위반 루트는 종료 1 이고 규칙 ID 와 경로:줄을 출력한다", () => {
		const result = run(VIOLATING);
		expect(result.code).toBe(1);
		expect(result.out).toContain(
			"MS-foreign-schema modules/alpha/migrations/0001_fk.sql:3",
		);
		expect(result.out).toContain("위반 4");
	});

	test("마이그레이션이 없는 루트는 검사 대상 0 으로 통과한다", () => {
		const result = run(`${FIXTURES}no-such-root`);
		expect(result.code).toBe(0);
		expect(result.out).toContain("검사 대상 0");
	});
});

describe("실저장소", () => {
	test("모듈 마이그레이션 SQL 이 타 모듈 스키마를 참조하지 않는다", () => {
		const files = loadMigrationFiles(REPO);
		expect(files.map((f) => f.module)).toContain("events");
		expect(judgeMigrationIsolation(files)).toEqual([]);
	});
});
