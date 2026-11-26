// 마이그레이션 실행기(L3) — 실제 Postgres 에서 재현·증분·멱등·순서 불변·실패 원자성·잠금·모듈 격리를 본다.
// TEST_DATABASE_URL 계약은 support.ts 에 있다. 파일마다 새 DB 를 쓰고 afterAll 에서 지운다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbPool, type MigrationModule, runMigrations } from "@pf/db";
import {
	catalogSnapshot,
	FIXTURE_MODULES,
	freshDatabase,
	queryRows,
	waitFor,
} from "./support.ts";

const TIMEOUT_MS = 30_000;
const WAIT_MS = 10_000;
const NO_ROLES = { roles: [], tables: {} };

function fixture(name: string): MigrationModule {
	return { name, folder: join(FIXTURE_MODULES, name, "migrations") };
}

const alpha = fixture("alpha");
const beta = fixture("beta");
const broken = fixture("broken");

const databases: Array<{ drop(): Promise<void> }> = [];
const tempDirs: string[] = [];

afterAll(async () => {
	for (const database of databases.splice(0)) {
		await database.drop();
	}
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

async function newDatabaseUrl(): Promise<string> {
	const database = await freshDatabase();
	databases.push(database);
	return database.url;
}

async function migrate(url: string, modules: ReadonlyArray<MigrationModule>) {
	const pool = createDbPool({ url });
	try {
		return await runMigrations(pool, { modules, roles: NO_ROLES });
	} finally {
		await pool.close(5_000);
	}
}

async function historyCount(url: string, module: string): Promise<number> {
	const rows = await queryRows(
		url,
		`select count(*)::int as n from pf_migrations."${module}"`,
	);
	return Number(rows[0]?.n);
}

async function regclass(url: string, name: string): Promise<unknown> {
	const rows = await queryRows(url, "select to_regclass($1) as found", [name]);
	return rows[0]?.found;
}

describe("runMigrations", () => {
	let sharedUrl = "";
	let sharedSnapshot = "";

	beforeAll(async () => {
		sharedUrl = await newDatabaseUrl();
	}, TIMEOUT_MS);

	test(
		"① 새 DB 에 [alpha, beta] → Ok, 모듈별 이력 행 수 = 저널 항목 수, 객체가 생긴다",
		async () => {
			const result = await migrate(sharedUrl, [alpha, beta]);
			expect(result.ok).toBe(true);
			expect(await historyCount(sharedUrl, "alpha")).toBe(2);
			expect(await historyCount(sharedUrl, "beta")).toBe(2);
			expect(await regclass(sharedUrl, "alpha.item")).toBe("alpha.item");
			expect(await regclass(sharedUrl, "beta.thing")).toBe("beta.thing");
			const indexes = await queryRows(
				sharedUrl,
				"select indexname from pg_indexes where schemaname = 'alpha' order by 1",
			);
			expect(indexes.map((row) => row.indexname)).toContain("item_active_uq");
			sharedSnapshot = await catalogSnapshot(sharedUrl, ["alpha", "beta"]);
		},
		TIMEOUT_MS,
	);

	test(
		"② [beta, alpha] 순서로 다른 새 DB 에 적용해도 카탈로그가 같다(순서 불변)",
		async () => {
			const url = await newDatabaseUrl();
			const result = await migrate(url, [beta, alpha]);
			expect(result.ok).toBe(true);
			expect(await historyCount(url, "alpha")).toBe(2);
			expect(await historyCount(url, "beta")).toBe(2);
			expect(await catalogSnapshot(url, ["alpha", "beta"])).toBe(
				sharedSnapshot,
			);
		},
		TIMEOUT_MS,
	);

	test(
		"③ 같은 DB 에 다시 적용 → Ok, 이력 행 수·카탈로그 불변(멱등)",
		async () => {
			const result = await migrate(sharedUrl, [alpha, beta]);
			expect(result.ok).toBe(true);
			expect(await historyCount(sharedUrl, "alpha")).toBe(2);
			expect(await historyCount(sharedUrl, "beta")).toBe(2);
			expect(await catalogSnapshot(sharedUrl, ["alpha", "beta"])).toBe(
				sharedSnapshot,
			);
		},
		TIMEOUT_MS,
	);

	test(
		"④ 증분 — 첫 항목만 있는 사본을 적용한 뒤 원본을 적용하면 0001 객체만 새로 생긴다",
		async () => {
			// 임시 사본은 저장소 밖에 둔다 — 바깥 bun test 가 집어 가지 않게(scripts/bunfig-env.test.ts 와 같은 이유).
			const copyRoot = mkdtempSync(join(tmpdir(), "pf-db-incremental-"));
			tempDirs.push(copyRoot);
			const partial = join(copyRoot, "migrations");
			cpSync(alpha.folder, partial, { recursive: true });
			rmSync(join(partial, "0001_raw_objects.sql"));
			writeFileSync(
				join(partial, "meta", "_journal.json"),
				JSON.stringify({
					version: "7",
					dialect: "postgresql",
					entries: [
						{
							idx: 0,
							version: "7",
							when: 1790000000000,
							tag: "0000_schema",
							breakpoints: true,
						},
					],
				}),
			);

			const url = await newDatabaseUrl();
			const first = await migrate(url, [{ name: "alpha", folder: partial }]);
			expect(first.ok).toBe(true);
			expect(await historyCount(url, "alpha")).toBe(1);
			expect(await regclass(url, "alpha.item")).toBe("alpha.item");
			expect(await regclass(url, "alpha.item_active_uq")).toBeNull();

			const second = await migrate(url, [alpha]);
			expect(second.ok).toBe(true);
			expect(await historyCount(url, "alpha")).toBe(2);
			expect(await regclass(url, "alpha.item_active_uq")).toBe(
				"alpha.item_active_uq",
			);
		},
		TIMEOUT_MS,
	);

	test(
		"⑤ [alpha, broken, beta] → Err(details.module = broken), broken 은 통째로 되돌려지고 alpha 만 적용된다",
		async () => {
			const url = await newDatabaseUrl();
			const result = await migrate(url, [alpha, broken, beta]);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.details).toEqual({ module: "broken" });
			}
			expect(await historyCount(url, "alpha")).toBe(2);
			// broken 의 0000 은 성공했지만 0001 이 실패해 한 tx 로 함께 되돌려진다 — 이력 0행·스키마 없음.
			expect(await historyCount(url, "broken")).toBe(0);
			const schemas = await queryRows(
				url,
				"select count(*)::int as n from pg_namespace where nspname = 'broken'",
			);
			expect(Number(schemas[0]?.n)).toBe(0);
			// 첫 실패에서 멈추므로 beta 는 손대지 않는다.
			expect(await regclass(url, "pf_migrations.beta")).toBeNull();
			expect(await regclass(url, "beta.thing")).toBeNull();
		},
		TIMEOUT_MS,
	);

	test(
		"⑥ 잠금 — 시험이 같은 키 잠금을 쥔 동안 실행기는 advisory 잠금을 기다리며 이력이 0 이다",
		async () => {
			const url = await newDatabaseUrl();
			const holder = new Bun.SQL(url);
			const held = await holder.reserve();
			let running: ReturnType<typeof migrate> | undefined;
			try {
				await held`select pg_advisory_lock(hashtext('pf-migrate'))`;
				let settled = false;
				running = migrate(url, [alpha, beta]);
				running.then(() => {
					settled = true;
				});

				// 실행기의 백엔드가 advisory 잠금을 기다리는 것을 조건으로 확인한다(고정 sleep 아님).
				await waitFor(
					"실행기가 advisory 잠금 대기",
					async () => {
						const rows = await queryRows(
							url,
							"select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and wait_event = 'advisory'",
						);
						return Number(rows[0]?.n) >= 1;
					},
					WAIT_MS,
				);
				expect(settled).toBe(false);
				expect(await regclass(url, "pf_migrations.alpha")).toBeNull();
				expect(await regclass(url, "alpha.item")).toBeNull();

				await held`select pg_advisory_unlock(hashtext('pf-migrate'))`;
			} finally {
				await held.release();
				await holder.close();
			}
			const result = await running;
			expect(result?.ok).toBe(true);
			expect(await historyCount(url, "alpha")).toBe(2);
			expect(await historyCount(url, "beta")).toBe(2);
		},
		TIMEOUT_MS,
	);

	test(
		"⑦ 한 모듈만 다시 적용해도 다른 모듈의 이력은 바뀌지 않는다",
		async () => {
			const before = await queryRows(
				sharedUrl,
				'select hash, created_at from pf_migrations."beta" order by id',
			);
			const result = await migrate(sharedUrl, [alpha]);
			expect(result.ok).toBe(true);
			const after = await queryRows(
				sharedUrl,
				'select hash, created_at from pf_migrations."beta" order by id',
			);
			expect(after).toEqual(before);
			expect(before.length).toBe(2);
		},
		TIMEOUT_MS,
	);

	test(
		"⑧ 풀 상한 2(허용 하한)에서도 멈추지 않고 성공한다 — 상한 1 은 L2 가 거절한다",
		async () => {
			const url = await newDatabaseUrl();
			const sized = new URL(url);
			sized.searchParams.set("max", "2");
			const result = await migrate(sized.toString(), [alpha]);
			expect(result.ok).toBe(true);
			expect(await historyCount(url, "alpha")).toBe(2);
		},
		TIMEOUT_MS,
	);
});
