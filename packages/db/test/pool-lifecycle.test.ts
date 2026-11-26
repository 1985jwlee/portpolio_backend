// 풀 생명주기(L2) — stats·close(deadlineMs)·ping. 실제 DB 없이 닿지 않는 주소·응답하지 않는 소켓으로 잰다.
import { afterAll, describe, expect, test } from "bun:test";
import { createDbPool, type DbPool, ping } from "@pf/db";
import { PermanentError, TransientError } from "@pf/kernel";

// 접속은 받되 아무것도 답하지 않는 서버 — ping 의 시간 제한이 실제로 걸리는지 본다.
const silent = Bun.listen({
	hostname: "127.0.0.1",
	port: 0,
	socket: { data() {}, open() {} },
});
const pools: DbPool[] = [];

function poolOf(url: string): DbPool {
	const pool = createDbPool({ url });
	pools.push(pool);
	return pool;
}

afterAll(async () => {
	await Promise.all(pools.map((pool) => pool.close(0)));
	silent.stop(true);
});

describe("DbPool.stats · close", () => {
	test("max 는 Bun.SQL 이 주는 숫자이고 closed 는 close 를 부른 뒤 참이 된다", async () => {
		const pool = poolOf("postgres://u:p@127.0.0.1:1/none");
		expect(typeof pool.stats().max).toBe("number");
		expect(pool.stats().closed).toBe(false);
		await pool.close(0);
		expect(pool.stats().closed).toBe(true);
	});

	test("stats 는 접속 문자열(비밀)을 싣지 않는다", () => {
		const pool = poolOf("postgres://u:sentinel-pw@127.0.0.1:1/none");
		expect(JSON.stringify(pool.stats())).not.toContain("sentinel-pw");
	});

	test("음수 기한은 0 으로 본다 — 던지지 않고 닫힌다", async () => {
		const pool = poolOf("postgres://u:p@127.0.0.1:1/none");
		await pool.close(-5);
		expect(pool.stats().closed).toBe(true);
	});
});

describe("ping", () => {
	test("닿지 않는 주소는 TransientError 로 끝난다", async () => {
		const result = await ping(poolOf("postgres://u:p@127.0.0.1:1/none"), 2_000);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(TransientError);
		}
	});

	test("응답이 없으면 시간 제한 안에 TransientError 로 돌아온다", async () => {
		const pool = poolOf(
			`postgres://u:p@127.0.0.1:${silent.port}/none?sslmode=disable`,
		);
		const start = performance.now();
		const result = await ping(pool, 100);
		const elapsed = performance.now() - start;
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(TransientError);
		}
		// 제한(100ms)을 한참 넘겨 기다렸다면 시간 제한이 걸리지 않은 것이다.
		expect(elapsed).toBeLessThan(1_500);
	});

	test("createDbPool 로 만들지 않은 풀은 PermanentError 다", async () => {
		const fake: DbPool = {
			read: poolOf("postgres://u:p@127.0.0.1:1/none").read,
			stats: () => ({ max: undefined, closed: false }),
			close: async () => {},
		};
		const result = await ping(fake, 100);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(PermanentError);
		}
	});
});
