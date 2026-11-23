// 권한 문장 생성(L2) — DB 없이 grantStatements 가 내는 문장을 문자열로 본다. 적용 결과는 integration/grants.test.ts 가 본다.
// 회수 대상 스키마 = 접속 역할 소유 스키마 ∪ 명세 스키마(M-1): 명세에서 표가 전부 빠진 스키마도 회수 문장을 받아야 한다.
import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { grantStatements } from "../src/adapter/postgres/raw/grants.ts";
import type { RolesSpec } from "../src/roles-spec.ts";

const dialect = new PgDialect();

function render(
	spec: RolesSpec,
	ownedSchemas: ReadonlyArray<string>,
): string[] {
	return grantStatements(spec, ownedSchemas).map(
		(statement) => dialect.sqlToQuery(statement).sql,
	);
}

const noTables: RolesSpec = { roles: ["pf_api_rw"], tables: [] };

describe("grantStatements — 회수 대상 스키마", () => {
	test("명세에 표가 없어도 소유 스키마마다 회수 두 문장이 나간다", () => {
		expect(render(noTables, ["alpha"])).toEqual([
			'revoke all on schema "alpha" from PUBLIC, "pf_api_rw"',
			'revoke all on all tables in schema "alpha" from PUBLIC, "pf_api_rw"',
		]);
	});

	test("소유 스키마가 없고 표도 없으면 문장이 0개다", () => {
		expect(render(noTables, [])).toEqual([]);
	});

	test("소유 스키마와 명세 스키마의 합집합을 이름순으로 낸다 — 겹치면 한 번만", () => {
		const spec: RolesSpec = {
			roles: ["pf_api_rw"],
			tables: [
				{
					schema: "beta",
					table: "thing",
					grants: [{ role: "pf_api_rw", privileges: ["SELECT"] }],
				},
			],
		};
		const statements = render(spec, ["zeta", "beta", "alpha"]);
		const schemaOrder = statements
			.filter((text) => text.startsWith("revoke all on schema"))
			.map((text) => text.split(" ")[4]);
		expect(schemaOrder).toEqual(['"alpha"', '"beta"', '"zeta"']);
		// 명세 스키마에만 USAGE·부여가 나간다 — 소유만 한 스키마는 회수뿐이다.
		expect(statements.filter((text) => text.startsWith("grant "))).toEqual([
			'grant usage on schema "beta" to "pf_api_rw"',
			'grant SELECT on table "beta"."thing" to "pf_api_rw"',
		]);
	});

	test("소유 스키마 이름도 식별자로 인용된다 — 따옴표는 이스케이프된다", () => {
		const [first] = render(noTables, ['a"b']);
		expect(first).toBe('revoke all on schema "a""b" from PUBLIC, "pf_api_rw"');
	});
});
