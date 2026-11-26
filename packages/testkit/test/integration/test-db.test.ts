import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ChaosHarness, ModuleHarness, TestDb } from "../../src/index.ts";
import { adminUrl } from "./support.ts";

describe("TestDb (L3)", () => {
	const a = new TestDb(adminUrl());
	const b = new TestDb(adminUrl());

	beforeAll(async () => {
		await Promise.all([a.start(), b.start()]);
	});
	afterAll(async () => {
		await Promise.all([a.stop(), b.stop()]);
	});

	test("병렬로 만든 두 TestDb 는 서로의 표를 보지 못한다", async () => {
		const [sa, sb] = await Promise.all([a.freshSchema(), b.freshSchema()]);
		await sa.sql.unsafe("create table probe (id int)");
		await sa.sql.unsafe("insert into probe values (1)");
		const found = await sb.sql.unsafe("select to_regclass('probe') as t");
		expect(found[0]?.t).toBeNull();
		expect(a.url()).not.toBe(b.url());
	});

	test("같은 TestDb 의 freshSchema 는 호출마다 다른 스키마를 준다", async () => {
		const first = await a.freshSchema();
		const second = await a.freshSchema();
		expect(first.schema).not.toBe(second.schema);
		await first.sql.unsafe("create table t (id int)");
		const found = await second.sql.unsafe("select to_regclass('t') as t");
		expect(found[0]?.t).toBeNull();
	});

	test("truncate 는 행만 비우고 표는 남긴다", async () => {
		const { sql } = await a.freshSchema();
		await sql.unsafe("create table keep (id int)");
		await sql.unsafe("insert into keep values (1), (2)");
		await a.truncate();
		const rows = await sql.unsafe("select count(*)::int as n from keep");
		expect(rows[0]?.n).toBe(0);
	});
});

describe("DB 계열 하니스 (L3)", () => {
	test("ModuleHarness·ChaosHarness 는 빈 시험에서 setup·teardown 이 돈다", async () => {
		for (const harness of [
			new ModuleHarness(adminUrl()),
			new ChaosHarness(adminUrl()),
		]) {
			await harness.setup();
			const { sql } = await harness.db.freshSchema();
			expect((await sql.unsafe("select 1 as one"))[0]?.one).toBe(1);
			await harness.teardown();
		}
	});
});
