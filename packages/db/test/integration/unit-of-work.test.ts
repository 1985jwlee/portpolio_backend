// UnitOfWork(L3) — 커밋·롤백·예외·중첩·시간 제한·now 고정을 실제 Postgres 에서 본다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	createDbPool,
	type DbPool,
	PostgresUnitOfWork,
	runMigrations,
	type TxContext,
} from "@pf/db";
import { type Clock, ConflictError, PermanentError, Result } from "@pf/kernel";
import { sql } from "drizzle-orm";
import {
	alphaItem,
	deferred,
	FIXTURE_MODULES,
	freshDatabase,
	queryRows,
	within,
} from "./support.ts";

const TIMEOUT_MS = 30_000;
const GATE_MS = 10_000;
const FIXED_NOW = new Date("2026-01-02T03:04:05.000Z");

let database: Awaited<ReturnType<typeof freshDatabase>>;
let pool: DbPool;
let clockCalls = 0;
const clock: Clock = {
	now: () => {
		clockCalls += 1;
		return FIXED_NOW;
	},
};
let uow: PostgresUnitOfWork;

beforeAll(async () => {
	database = await freshDatabase();
	pool = createDbPool({ url: database.url });
	const migrated = await runMigrations(pool, {
		modules: [
			{
				name: "alpha",
				folder: join(FIXTURE_MODULES, "alpha", "migrations"),
			},
		],
		roles: { roles: [], tables: {} },
	});
	expect(migrated.ok).toBe(true);
	uow = new PostgresUnitOfWork(pool, clock);
}, TIMEOUT_MS);

afterAll(async () => {
	await pool.close(5_000);
	await database.drop();
});

async function itemIds(): Promise<number[]> {
	const rows = await queryRows(
		database.url,
		"select id from alpha.item order by id",
	);
	return rows.map((row) => Number(row.id));
}

// 드라이버 오류는 Drizzle 이 DrizzleQueryError 로 감싸므로 cause 사슬을 따라 SQLSTATE(errno)를 찾는다.
function sqlstateOf(error: unknown): unknown {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const errno: unknown = Reflect.get(current, "errno");
		if (typeof errno === "string") {
			return errno;
		}
		current = current.cause;
	}
	return undefined;
}

describe("PostgresUnitOfWork.run", () => {
	test(
		"Ok → 커밋되어 다른 연결에 보이고 그 Ok 가 그대로 돌아온다",
		async () => {
			const result = await uow.run(async (tx) => {
				await tx.db
					.insert(alphaItem)
					.values({ id: 1, entryId: 1, actorId: "a" });
				return Result.ok("done");
			});
			expect(result).toEqual({ ok: true, value: "done" });
			expect(await itemIds()).toEqual([1]);
		},
		TIMEOUT_MS,
	);

	test(
		"Err → 롤백되어 행이 없고 받은 것은 같은 Err 객체다",
		async () => {
			const failure = new ConflictError();
			const result = await uow.run(async (tx) => {
				await tx.db
					.insert(alphaItem)
					.values({ id: 2, entryId: 2, actorId: "a" });
				return Result.err(failure);
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe(failure);
			}
			expect(await itemIds()).toEqual([1]);
		},
		TIMEOUT_MS,
	);

	test(
		"콜백 예외 → 롤백되어 행이 없고 PermanentError 가 원인(cause)을 보존한다",
		async () => {
			const boom = new Error("boom");
			const result = await uow.run(async (tx) => {
				await tx.db
					.insert(alphaItem)
					.values({ id: 3, entryId: 3, actorId: "a" });
				throw boom;
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(PermanentError);
				expect(result.error.cause).toBe(boom);
			}
			expect(await itemIds()).toEqual([1]);
		},
		TIMEOUT_MS,
	);

	test(
		"중첩 run → 안쪽 fn 은 불리지 않고 PermanentError, 바깥은 영향받지 않는다",
		async () => {
			let innerCalled = false;
			// 다른 UoW 인스턴스로 감싸도 중첩이다 — 저장소가 인스턴스가 아니라 모듈 하나라서다.
			const other = new PostgresUnitOfWork(pool, clock);
			const result = await uow.run(async () => {
				const inner = await other.run(async () => {
					innerCalled = true;
					return Result.ok(1);
				});
				expect(inner.ok).toBe(false);
				if (!inner.ok) {
					expect(inner.error).toBeInstanceOf(PermanentError);
				}
				return Result.ok("outer");
			});
			expect(innerCalled).toBe(false);
			expect(result).toEqual({ ok: true, value: "outer" });
		},
		TIMEOUT_MS,
	);

	test(
		"동시에 도는 두 run 은 중첩이 아니라 둘 다 Ok 다",
		async () => {
			// 첫 run 이 fn 안에 머무는 동안 *바깥 맥락에서* 둘째 run 을 시작한다 — 시작 시점 판정이 전역 불리언이면 여기서 중첩으로 오인된다.
			const entered = deferred();
			const finish = deferred();
			const firstRun = uow.run(async () => {
				entered.resolve();
				await finish.promise;
				return Result.ok("one");
			});
			const second = await (async () => {
				try {
					await within("첫 run 이 fn 에 진입", entered.promise, GATE_MS);
					return await uow.run(async () => Result.ok("two"));
				} finally {
					finish.resolve();
				}
			})();
			const first = await within("첫 run 종료", firstRun, GATE_MS);
			expect(second.ok).toBe(true);
			expect(first.ok).toBe(true);
		},
		TIMEOUT_MS,
	);

	test(
		"tx 안의 시간 제한이 5s·10s·2s 이고 timeoutMs 는 statement_timeout 만 바꾼다",
		async () => {
			const read = (tx: TxContext) =>
				tx.db.execute(
					sql`select current_setting('statement_timeout') as st, current_setting('idle_in_transaction_session_timeout') as idle, current_setting('lock_timeout') as lock`,
				);
			const defaults = await uow.run(async (tx) => Result.ok(await read(tx)));
			const custom = await uow.run(async (tx) => Result.ok(await read(tx)), {
				timeoutMs: 1500,
			});
			if (!defaults.ok || !custom.ok) {
				throw new Error("두 run 모두 Ok 여야 한다");
			}
			const [d] = defaults.value;
			const [c] = custom.value;
			expect([d?.st, d?.idle, d?.lock]).toEqual(["5s", "10s", "2s"]);
			expect([c?.st, c?.idle, c?.lock]).toEqual(["1500ms", "10s", "2s"]);
		},
		TIMEOUT_MS,
	);

	test(
		"시간 제한은 트랜잭션 로컬이다 — 풀 연결을 모두 거친 뒤 tx 밖의 읽기에서 statement_timeout 은 서버 기본값(0)이다",
		async () => {
			// 풀(최대 10)의 연결을 전부 tx 로 한 번씩 거치게 한 뒤, 같은 풀의 tx 밖 읽기를 연결 수보다 많이 동시에 낸다.
			// set_config 의 셋째 인자가 false(세션 값)로 바뀌면 일부 읽기가 1500ms 를 본다.
			for (let i = 0; i < 12; i += 1) {
				const run = await uow.run(async () => Result.ok(i), {
					timeoutMs: 1500,
				});
				expect(run.ok).toBe(true);
			}
			const reads = await Promise.all(
				Array.from({ length: 12 }, () =>
					pool.read
						.select({ st: sql<string>`current_setting('statement_timeout')` })
						.from(sql`(select 1) as one`),
				),
			);
			expect(new Set(reads.flat().map((row) => row.st))).toEqual(
				new Set(["0"]),
			);
		},
		TIMEOUT_MS,
	);

	test(
		"timeoutMs 를 작게, pg_sleep 을 길게 → Err(PermanentError) 이고 원인이 57014(query_canceled)다",
		async () => {
			// pg_sleep 은 제한의 10배 이상이다 — 실시계라 여유가 필요하다.
			const result = await uow.run(
				async (tx) => {
					await tx.db.execute(sql`select pg_sleep(3)`);
					return Result.ok(1);
				},
				{ timeoutMs: 300 },
			);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(PermanentError);
				expect(sqlstateOf(result.error.cause)).toBe("57014");
			}
		},
		TIMEOUT_MS,
	);

	test(
		"tx.now 는 주입한 시계의 값이고 run 당 시계를 한 번만 읽는다",
		async () => {
			const before = clockCalls;
			const result = await uow.run(async (tx) => Result.ok(tx.now));
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(FIXED_NOW);
			}
			expect(clockCalls - before).toBe(1);
		},
		TIMEOUT_MS,
	);
});
