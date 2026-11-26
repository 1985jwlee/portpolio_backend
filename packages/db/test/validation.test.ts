// 입력 검증이 I/O 앞에서 끝난다는 계약(L2) — 닿지 않는 주소로 만든 풀에서도 검증 오류가 먼저 나와야 한다.
// 검증이 I/O 뒤로 밀리면 연결 오류(details.stage = "lock")가 대신 나와 이 시험이 빨강이 된다 — 그것이 목적이다.
import { afterAll, describe, expect, test } from "bun:test";
import {
	createDbPool,
	type DbPool,
	PostgresUnitOfWork,
	runMigrations,
} from "@pf/db";
import { PermanentError, Result } from "@pf/kernel";

const pool = createDbPool({ url: "postgres://u:p@127.0.0.1:1/none" });
const validRoles = { roles: ["pf_api_rw"], tables: {} };
const folder = "/nonexistent";

afterAll(async () => {
	await pool.close(5_000);
});

async function failureOf(plan: Parameters<typeof runMigrations>[1]) {
	const result = await runMigrations(pool, plan);
	if (result.ok) {
		throw new Error("Err 여야 한다");
	}
	return result.error;
}

describe("runMigrations 입력 검증", () => {
	test("모듈 이름 형식 · 중복은 그 이름을 details.module 로 가리킨다", async () => {
		const badName = await failureOf({
			modules: [{ name: "Bad-Name", folder }],
			roles: validRoles,
		});
		expect(badName).toBeInstanceOf(PermanentError);
		expect(badName.details).toEqual({ module: "Bad-Name" });

		const duplicate = await failureOf({
			modules: [
				{ name: "alpha", folder },
				{ name: "alpha", folder },
			],
			roles: validRoles,
		});
		expect(duplicate.details).toEqual({ module: "alpha" });
	});

	const rolesCases: ReadonlyArray<readonly [string, unknown, string]> = [
		["최상위가 객체가 아님", null, "(root)"],
		["tables 키 누락", { roles: ["r"] }, "tables"],
		["roles 키 누락", { tables: {} }, "roles"],
		["알 수 없는 최상위 키", { roles: [], tables: {}, extra: 1 }, "extra"],
		["역할 이름 형식 오류", { roles: ["Bad-Role"], tables: {} }, "roles"],
		["public 은 관리 역할이 아님", { roles: ["public"], tables: {} }, "roles"],
		["역할 중복", { roles: ["r", "r"], tables: {} }, "roles"],
		["표 키가 식별자 하나", { roles: ["r"], tables: { s: {} } }, "tables.s"],
		[
			"화이트리스트 밖 권한",
			{ roles: ["r"], tables: { "s.t": { r: ["TRUNCATE"] } } },
			"tables.s.t.r",
		],
		[
			"roles 에 없는 역할",
			{ roles: ["r"], tables: { "s.t": { other: ["SELECT"] } } },
			"tables.s.t.other",
		],
		[
			"빈 권한 배열",
			{ roles: ["r"], tables: { "s.t": { r: [] } } },
			"tables.s.t.r",
		],
		[
			"권한 중복",
			{ roles: ["r"], tables: { "s.t": { r: ["SELECT", "SELECT"] } } },
			"tables.s.t.r",
		],
	];

	for (const [label, roles, key] of rolesCases) {
		test(`권한 명세 오류 — ${label}`, async () => {
			const error = await failureOf({ modules: [], roles });
			expect(error).toBeInstanceOf(PermanentError);
			expect(error.details).toEqual({ roles: key });
		});
	}

	test("대조군 — 올바른 입력은 검증을 통과해 연결 단계에서 실패한다(검증 오류와 구별된다)", async () => {
		const error = await failureOf({
			modules: [{ name: "alpha", folder }],
			roles: validRoles,
		});
		expect(error.details).toEqual({ stage: "lock" });
	});

	test("createDbPool 로 만들지 않은 풀은 거절한다", async () => {
		const fake: DbPool = {
			read: pool.read,
			stats: () => ({ max: undefined, closed: false }),
			close: async () => {},
		};
		const result = await runMigrations(fake, {
			modules: [],
			roles: validRoles,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("createDbPool");
		}
	});
});

describe("runMigrations 풀 상한", () => {
	// 상한 1 이면 잠금용 예약 연결이 풀을 다 쥐어 DB 가 살아 있어도 영원히 멈춘다 — 연결 전에 거절돼야 한다.
	// 검사를 지우면 이 주소에서는 연결 거부로 stage = "lock" 이 나와 빨강이 된다. 상한 2 는 경계의 통과쪽이다.
	const cases: ReadonlyArray<readonly [string, string, unknown]> = [
		["max=1 은 거절한다", "?max=1", { stage: "pool", max: 1 }],
		["max=2 는 통과해 연결 단계로 간다", "?max=2", { stage: "lock" }],
	];

	for (const [label, query, details] of cases) {
		test(label, async () => {
			const sized = createDbPool({
				url: `postgres://u:p@127.0.0.1:1/none${query}`,
			});
			try {
				const result = await runMigrations(sized, {
					modules: [],
					roles: validRoles,
				});
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.error.details).toEqual(details);
				}
			} finally {
				await sized.close(5_000);
			}
		});
	}
});

describe("저장소 roles.json", () => {
	// 동작 시험의 픽스처가 아니라 실제 파일의 유효성이 대상이다 — 깨진 채 커밋되면 db:migrate 가 운영에서야 종료 1 로 막힌다.
	// 명세 검증을 통과하면 연결 단계(stage = "lock")까지 간다.
	test("명세 검증을 통과한다", async () => {
		const roles: unknown = await Bun.file(
			new URL("../roles.json", import.meta.url),
		).json();
		const error = await failureOf({ modules: [], roles });
		expect(error.details).toEqual({ stage: "lock" });
	});
});

describe("PostgresUnitOfWork.run 입력 검증", () => {
	const clock = { now: () => new Date(0) };

	// 2_147_483_648 은 Postgres 정수 GUC 상한(2_147_483_647) 바로 위다 — DB 까지 가지 않고 입력 오류로 끝나야 한다.
	for (const timeoutMs of [0, -1, 1.5, Number.NaN, 2_147_483_648]) {
		test(`timeoutMs ${timeoutMs} 는 거절하고 fn 을 부르지 않는다`, async () => {
			let called = false;
			const uow = new PostgresUnitOfWork(pool, clock);
			const result = await uow.run(
				async () => {
					called = true;
					return Result.ok(1);
				},
				{ timeoutMs },
			);
			expect(called).toBe(false);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(PermanentError);
				expect(result.error.details).toEqual({ timeoutMs });
			}
		});
	}

	test("createDbPool 로 만들지 않은 풀은 거절하고 fn 을 부르지 않는다", async () => {
		let called = false;
		const fake: DbPool = {
			read: pool.read,
			stats: () => ({ max: undefined, closed: false }),
			close: async () => {},
		};
		const result = await new PostgresUnitOfWork(fake, clock).run(async () => {
			called = true;
			return Result.ok(1);
		});
		expect(called).toBe(false);
		expect(result.ok).toBe(false);
	});
});
