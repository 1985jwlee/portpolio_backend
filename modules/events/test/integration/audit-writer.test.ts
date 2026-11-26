// AuditWriter 원자성·권한·제약(L3) — 행위와 감사 행이 한 트랜잭션에서 함께 남거나 함께 사라지는지(AC-020),
// 역할별 표 권한(추가 전용)과 표의 CHECK 를 실제 Postgres 에서 본다. 이 호스트에서는 실행하지 못한다(CI integration).
// "행위" 는 시험이 만든 표 하나다 — 실제 usecase(guestbook 숨김)의 AC-020 는 S6-9 몫이다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	createDbPool,
	type DbPool,
	PostgresUnitOfWork,
	runMigrations,
} from "@pf/db";
import {
	type AuditEntry,
	ConflictError,
	PermanentError,
	Result,
} from "@pf/kernel";
import {
	FAULT_POINTS,
	FakeClock,
	FaultInjector,
	InjectedFaultError,
	TestDb,
} from "@pf/testkit";
import { pgTable, uuid } from "drizzle-orm/pg-core";
import { PostgresAuditWriter } from "../../src/adapter/postgres/audit-writer.ts";
import { adminUrl, ensureManagedRoles, sqlState } from "./support.ts";

const SETUP_TIMEOUT_MS = 60_000;
const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
const ROLES_JSON = new URL(
	"../../../../packages/db/roles.json",
	import.meta.url,
);

// 시험이 만든 "행위" 표 — 감사 행과 같은 트랜잭션에서 쓰이는 상대다.
const probe = pgTable("audit_probe", { id: uuid("id").primaryKey() });

const testDb = new TestDb(adminUrl());
const clock = new FakeClock(new Date("2026-03-04T05:06:07.000Z"));
let pool: DbPool;
let uow: PostgresUnitOfWork;
let reader: Bun.SQL;

beforeAll(async () => {
	await ensureManagedRoles();
	await testDb.start();
	pool = createDbPool({ url: testDb.url() });
	uow = new PostgresUnitOfWork(pool, clock);
	reader = new Bun.SQL(testDb.url());
	await reader.unsafe("create table audit_probe (id uuid primary key)");
	// 실제 권한 명세(packages/db/roles.json)를 그대로 적용한다 — 시험이 명세와 갈라지지 않게.
	const roles: unknown = JSON.parse(await Bun.file(ROLES_JSON).text());
	const migrated = await runMigrations(pool, {
		modules: [{ name: "events", folder: MIGRATIONS }],
		roles,
	});
	if (!migrated.ok) {
		throw migrated.error;
	}
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
	await reader.close();
	await pool.close(5_000);
	await testDb.stop();
});

function entryFor(
	id: string,
	detail: AuditEntry["detail"] = { count: 1 },
): AuditEntry {
	return {
		category: "admin",
		action: "entry_hidden",
		actorRole: "admin",
		actorKey: "user:42",
		targetType: "entry",
		targetId: id,
		outcome: "success",
		traceId: id,
		detail,
	};
}

// 행위 표와 감사 표에서 이 시험의 id 가 몇 행인지 — id 가 시험마다 달라 파일 안의 다른 시험과 섞이지 않는다.
async function countsOf(id: string): Promise<{ probe: number; audit: number }> {
	const probeRows =
		await reader`select count(*)::int as n from audit_probe where id = ${id}`;
	const auditRows =
		await reader`select count(*)::int as n from events.audit_log where trace_id = ${id}`;
	return { probe: probeRows[0]?.n ?? -1, audit: auditRows[0]?.n ?? -1 };
}

describe("행위와 감사 행의 원자성", () => {
	test("커밋하면 둘 다 남고 감사 행은 tx.now·고정 열거 값으로 들어간다", async () => {
		const id = crypto.randomUUID();
		const writer = new PostgresAuditWriter(new FaultInjector());

		const result = await uow.run(async (tx) => {
			await tx.db.insert(probe).values({ id });
			await writer.record(tx, entryFor(id));
			return Result.ok(undefined);
		});

		expect(result.ok).toBe(true);
		expect(await countsOf(id)).toEqual({ probe: 1, audit: 1 });
		const [row] =
			await reader`select category, action, actor_role, actor_key, target_id, outcome, reason_code, detail, at from events.audit_log where trace_id = ${id}`;
		expect(row).toMatchObject({
			category: "admin",
			action: "entry_hidden",
			actor_role: "admin",
			actor_key: "user:42",
			target_id: id,
			outcome: "success",
			reason_code: null,
			detail: { count: 1 },
		});
		expect(new Date(row.at).getTime()).toBe(clock.now().getTime());
	});

	test("행위가 Err 를 돌려주면 둘 다 없다", async () => {
		const id = crypto.randomUUID();
		const writer = new PostgresAuditWriter(new FaultInjector());

		const result = await uow.run(async (tx) => {
			await tx.db.insert(probe).values({ id });
			await writer.record(tx, entryFor(id));
			return Result.err(new ConflictError({ message: "버전 충돌" }));
		});

		expect(result.ok).toBe(false);
		expect(await countsOf(id)).toEqual({ probe: 0, audit: 0 });
	});

	test("record 직후에 장애를 주입하면 둘 다 없다", async () => {
		const id = crypto.randomUUID();
		const faults = new FaultInjector();
		faults.failAt(FAULT_POINTS.AUDIT_WRITER_AFTER_RECORD);
		const writer = new PostgresAuditWriter(faults);

		const result = await uow.run(async (tx) => {
			await tx.db.insert(probe).values({ id });
			await writer.record(tx, entryFor(id));
			return Result.ok(undefined);
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(PermanentError);
			// 장애가 정말 그 지점에서 났다는 증거 — 다른 이유의 실패로 "둘 다 없다" 가 우연히 참이 되지 않게 한다.
			expect(result.error.cause).toBeInstanceOf(InjectedFaultError);
		}
		expect(await countsOf(id)).toEqual({ probe: 0, audit: 0 });
	});

	test("detail 이 규칙을 어기면 PermanentError 로 끝나고 둘 다 없다", async () => {
		const id = crypto.randomUUID();
		const writer = new PostgresAuditWriter(new FaultInjector());

		const result = await uow.run(async (tx) => {
			await tx.db.insert(probe).values({ id });
			await writer.record(tx, entryFor(id, { cookie: "x" }));
			return Result.ok(undefined);
		});

		expect(result.ok).toBe(false);
		expect(await countsOf(id)).toEqual({ probe: 0, audit: 0 });
	});
});

// 역할로 문장을 시도하고 SQLSTATE 를 돌려준다(성공이면 undefined). 항상 롤백한다 — 로그인 권한이 필요 없다.
async function attempt(
	role: string,
	statement: string,
): Promise<string | undefined> {
	const client = new Bun.SQL(testDb.url());
	const connection = await client.reserve();
	try {
		await connection.unsafe("begin");
		await connection.unsafe(`set local role "${role}"`);
		try {
			await connection.unsafe(statement);
			return undefined;
		} catch (error) {
			return sqlState(error);
		}
	} finally {
		await connection.unsafe("rollback");
		await connection.release();
		await client.close();
	}
}

const INSERT_ROW =
	"insert into events.audit_log (at, category, action, actor_role, outcome, trace_id, detail) values (now(), 'admin', 'entry_hidden', 'admin', 'success', gen_random_uuid(), '{}')";
const UPDATE_ROWS = "update events.audit_log set outcome = 'failed'";
const DELETE_ROWS = "delete from events.audit_log";
const SELECT_ROWS = "select 1 from events.audit_log";
const DENIED = "42501";

describe("역할별 권한 — 추가 전용(10-security §5.1)", () => {
	test("api 역할: 읽기·추가는 되고(양성 대조) 수정·삭제는 거부된다", async () => {
		expect(await attempt("pf_api_rw", SELECT_ROWS)).toBeUndefined();
		expect(await attempt("pf_api_rw", INSERT_ROW)).toBeUndefined();
		expect(await attempt("pf_api_rw", UPDATE_ROWS)).toBe(DENIED);
		expect(await attempt("pf_api_rw", DELETE_ROWS)).toBe(DENIED);
	});

	test("worker 역할: 읽기·추가·삭제(보관 정리)는 되고 수정은 거부된다", async () => {
		expect(await attempt("pf_worker_rw", SELECT_ROWS)).toBeUndefined();
		expect(await attempt("pf_worker_rw", INSERT_ROW)).toBeUndefined();
		expect(await attempt("pf_worker_rw", DELETE_ROWS)).toBeUndefined();
		expect(await attempt("pf_worker_rw", UPDATE_ROWS)).toBe(DENIED);
	});

	test("gateway 읽기 전용 역할은 감사 표를 읽지도 못한다", async () => {
		expect(await attempt("pf_gateway_ro", SELECT_ROWS)).toBe(DENIED);
	});
});

describe("표 제약", () => {
	const CHECK_VIOLATION = "23514";
	const insertWith = (overrides: {
		category?: string;
		reasonCode?: string;
		detail?: string;
	}) =>
		`insert into events.audit_log (at, category, action, actor_role, outcome, reason_code, trace_id, detail) values (now(), ${overrides.category ?? "'admin'"}, 'entry_hidden', 'admin', 'success', ${overrides.reasonCode ?? "null"}, gen_random_uuid(), ${overrides.detail ?? "'{}'::jsonb"})`;

	test("경계 값은 들어간다(대조)", async () => {
		await reader.unsafe(insertWith({ reasonCode: `'${"r".repeat(64)}'` }));
	});

	test("category 가 auth·admin·system 이 아니면 거부한다", async () => {
		await expect(
			reader.unsafe(insertWith({ category: "'other'" })),
		).rejects.toMatchObject({ errno: CHECK_VIOLATION });
	});

	test("reason_code 가 65자면 거부한다", async () => {
		await expect(
			reader.unsafe(insertWith({ reasonCode: `'${"r".repeat(65)}'` })),
		).rejects.toMatchObject({ errno: CHECK_VIOLATION });
	});

	test("detail 이 2048바이트를 넘으면 거부한다", async () => {
		const big = JSON.stringify({ text: "x".repeat(4000) });
		await expect(
			reader.unsafe(insertWith({ detail: `'${big}'::jsonb` })),
		).rejects.toMatchObject({ errno: CHECK_VIOLATION });
	});
});
