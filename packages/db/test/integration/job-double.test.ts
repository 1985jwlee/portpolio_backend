// AC-023 L3 — 잡 쓰기가 트랜잭션 안에서 일어나고, 배치는 배치마다 커밋된다. 실제 잡이 없어 시험용 대역으로 본다(Q6: packages/db/test/ 안에만).
// 관찰은 대역이 게이트에서 멈춘 동안 *다른 연결*이 한다 — 멈춤이 결정적이라 순간 샘플링의 우연이 없다.
// 대조군(자동 커밋 대역·단일 tx 대역)을 같은 관찰 함수에 넣어 반대 판정이 나오는 것을 상시 시험으로 둔다 —
// 관찰 수단이 위반을 구별한다는 증명이 매 실행에 남는다(scripts/bunfig-env.test.ts 의 D1 대조군과 같은 형태).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	createDbPool,
	type DbPool,
	PostgresUnitOfWork,
	runMigrations,
} from "@pf/db";
import { type AppError, ConflictError, Result } from "@pf/kernel";
import { inArray, sql } from "drizzle-orm";
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
// 배치 크기는 시험 매개변수다 — 제품 상수가 아니다.
const BATCH_SIZE = 2;
const ROW_COUNT = 5;

let database: Awaited<ReturnType<typeof freshDatabase>>;
let pool: DbPool;
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
	uow = new PostgresUnitOfWork(pool, { now: () => new Date() });
}, TIMEOUT_MS);

afterAll(async () => {
	await pool.close();
	await database.drop();
});

// 대역이 "쓰기를 마치고 멈춘 지점"을 알리고(reach), 시험이 풀어 줄 때까지(open) 기다리게 하는 문.
type Gate = {
	readonly reachedPid: Promise<number>;
	reach(pid: number): void;
	readonly opened: Promise<void>;
	open(): void;
};

function makeGate(): Gate {
	let reach: (pid: number) => void = () => {};
	const reachedPid = new Promise<number>((resolve) => {
		reach = resolve;
	});
	const release = deferred();
	return {
		reachedPid,
		reach: (pid) => reach(pid),
		opened: release.promise,
		open: () => release.resolve(),
	};
}

async function visibleCount(id: number): Promise<number> {
	const rows = await queryRows(
		database.url,
		"select count(*)::int as n from alpha.item where id = $1",
		[id],
	);
	return Number(rows[0]?.n);
}

async function remainingIds(): Promise<number[]> {
	const rows = await queryRows(
		database.url,
		"select id from alpha.item order by id",
	);
	return rows.map((row) => Number(row.id));
}

async function reseed(): Promise<void> {
	await queryRows(database.url, "delete from alpha.item");
	for (let id = 1; id <= ROW_COUNT; id += 1) {
		await queryRows(
			database.url,
			"insert into alpha.item (id, entry_id, actor_id) values ($1, $1, 'seed')",
			[id],
		);
	}
}

// 대역 ① 쓰기 1건을 UnitOfWork 안에서 하고 게이트에서 멈춘다.
function writeInTransaction(id: number, gate: Gate) {
	return uow.run(async (tx) => {
		await tx.db.insert(alphaItem).values({ id, entryId: id, actorId: "job" });
		const rows = await tx.db.execute(sql`select pg_backend_pid() as pid`);
		gate.reach(Number(rows[0]?.pid));
		await gate.opened;
		return Result.ok(id);
	});
}

// 대조군 ① UnitOfWork 를 거치지 않고 자동 커밋으로 쓴다 — 쓰기가 tx 밖에 있는 잘못된 대역이다.
async function writeAutoCommit(id: number, gate: Gate): Promise<void> {
	const client = new Bun.SQL(database.url);
	try {
		await client.unsafe(
			"insert into alpha.item (id, entry_id, actor_id) values ($1, $1, 'job')",
			[id],
		);
		const rows = await client.unsafe("select pg_backend_pid() as pid");
		gate.reach(Number(rows[0]?.pid));
		await gate.opened;
	} finally {
		await client.close();
	}
}

type Observation = {
	readonly visible: boolean;
	readonly state: string | undefined;
	readonly hasTransactionStart: boolean;
};

// 같은 관찰 함수 — 대역이 게이트에 닿으면 그 행이 다른 연결에 보이는지, 대역 연결의 상태가 무엇인지 본다.
async function observeAtGate(id: number, gate: Gate): Promise<Observation> {
	const pid = await within("대역이 게이트에 닿음", gate.reachedPid, GATE_MS);
	const activity = await queryRows(
		database.url,
		"select state, xact_start is not null as has_xact from pg_stat_activity where pid = $1",
		[pid],
	);
	return {
		visible: (await visibleCount(id)) > 0,
		state: String(activity[0]?.state),
		hasTransactionStart: activity[0]?.has_xact === true,
	};
}

// 게이트를 풀고 대역이 끝날 때까지 기다린다 — 관찰이 실패해도 대역이 매달리지 않게 finally 에서 부른다.
async function finish(gate: Gate, running: Promise<unknown>): Promise<void> {
	gate.open();
	await within("대역 종료", running, GATE_MS);
}

describe("AC-023 잡 쓰기는 트랜잭션 안에서 일어난다", () => {
	test(
		"UnitOfWork 대역 — 멈춘 동안 다른 연결에 안 보이고 idle in transaction 이며, 끝나면 보인다",
		async () => {
			await reseed();
			const gate = makeGate();
			const running = writeInTransaction(100, gate);
			let seen: Observation;
			try {
				seen = await observeAtGate(100, gate);
			} finally {
				await finish(gate, running);
			}
			expect(seen.visible).toBe(false);
			expect(seen.state).toBe("idle in transaction");
			expect(seen.hasTransactionStart).toBe(true);
			expect(await visibleCount(100)).toBe(1);
		},
		TIMEOUT_MS,
	);

	test(
		"대조군 — 자동 커밋 대역은 같은 관찰에서 이미 보이고 idle 이다(반대 판정)",
		async () => {
			await reseed();
			const gate = makeGate();
			const running = writeAutoCommit(101, gate);
			let seen: Observation;
			try {
				seen = await observeAtGate(101, gate);
			} finally {
				await finish(gate, running);
			}
			expect(seen.visible).toBe(true);
			expect(seen.state).toBe("idle");
			expect(seen.hasTransactionStart).toBe(false);
		},
		TIMEOUT_MS,
	);
});

// 대역 ② 키 순으로 n 행씩 지운다. 배치마다 run 을 따로 열고, failBatch 번째 배치에서 Err 로 멈춘다.
async function deleteInBatches(
	failBatch: number | undefined,
): Promise<Result<number, AppError>> {
	let deleted = 0;
	for (let batch = 1; ; batch += 1) {
		const result = await uow.run(async (tx) => {
			if (batch === failBatch) {
				return Result.err(new ConflictError({ message: "대역이 멈춘다" }));
			}
			const ids = await tx.db
				.select({ id: alphaItem.id })
				.from(alphaItem)
				.orderBy(alphaItem.id)
				.limit(BATCH_SIZE);
			if (ids.length === 0) {
				return Result.ok(0);
			}
			await tx.db.delete(alphaItem).where(
				inArray(
					alphaItem.id,
					ids.map((row) => row.id),
				),
			);
			return Result.ok(ids.length);
		});
		if (!result.ok) {
			return result;
		}
		if (result.value === 0) {
			return Result.ok(deleted);
		}
		deleted += result.value;
	}
}

// 대조군 ② 같은 일을 run 하나에 모두 넣는다 — 배치별 커밋이 아닌 잘못된 대역이다.
function deleteInOneTransaction(
	failBatch: number | undefined,
): Promise<Result<number, AppError>> {
	return uow.run(async (tx) => {
		let deleted = 0;
		for (let batch = 1; ; batch += 1) {
			if (batch === failBatch) {
				return Result.err(new ConflictError({ message: "대역이 멈춘다" }));
			}
			const ids = await tx.db
				.select({ id: alphaItem.id })
				.from(alphaItem)
				.orderBy(alphaItem.id)
				.limit(BATCH_SIZE);
			if (ids.length === 0) {
				return Result.ok(deleted);
			}
			await tx.db.delete(alphaItem).where(
				inArray(
					alphaItem.id,
					ids.map((row) => row.id),
				),
			);
			deleted += ids.length;
		}
	});
}

describe("AC-023 배치는 배치마다 커밋된다", () => {
	test(
		"배치 대역 — 3번째 배치에서 Err 로 멈추면 앞의 두 배치(4행)는 지워진 채 1행이 남는다",
		async () => {
			await reseed();
			const result = await deleteInBatches(3);
			expect(result.ok).toBe(false);
			expect(await remainingIds()).toEqual([5]);
		},
		TIMEOUT_MS,
	);

	test(
		"배치 대역 — 실패가 없으면 5행이 모두 지워진다",
		async () => {
			await reseed();
			const result = await deleteInBatches(undefined);
			expect(result).toEqual({ ok: true, value: ROW_COUNT });
			expect(await remainingIds()).toEqual([]);
		},
		TIMEOUT_MS,
	);

	test(
		"대조군 — 모든 배치를 tx 하나에 넣은 대역은 같은 조건에서 0행이 지워진다(반대 판정)",
		async () => {
			await reseed();
			const result = await deleteInOneTransaction(3);
			expect(result.ok).toBe(false);
			expect(await remainingIds()).toEqual([1, 2, 3, 4, 5]);
		},
		TIMEOUT_MS,
	);
});
