// RateLimiter — 계약 스위트를 운영 메모리 구현과 testkit 대역에 돌리고, 메모리 구현 고유의 입력 검증·청소를 본다.
import { describe, expect, test } from "bun:test";
import { ValidationError } from "@pf/kernel";
import { FakeClock, FakeRateLimiter } from "@pf/testkit";
import { MemoryRateLimiter } from "../src/index.ts";
import { runRateLimiterContract } from "./contract/rate-limiter.contract.ts";

runRateLimiterContract(
	"MemoryRateLimiter",
	(clock) => new MemoryRateLimiter(clock),
);
runRateLimiterContract(
	"FakeRateLimiter",
	(clock) => new FakeRateLimiter(clock),
);

describe("MemoryRateLimiter 입력 검증", () => {
	const bad: ReadonlyArray<{ capacity: number; refillPerSecond: number }> = [
		{ capacity: 0, refillPerSecond: 1 },
		{ capacity: 0.5, refillPerSecond: 1 },
		{ capacity: Number.NaN, refillPerSecond: 1 },
		{ capacity: Number.POSITIVE_INFINITY, refillPerSecond: 1 },
		{ capacity: 1, refillPerSecond: 0 },
		{ capacity: 1, refillPerSecond: -1 },
		{ capacity: 1, refillPerSecond: Number.NaN },
	];

	test.each(bad)(
		"잘못된 규칙 %o 은 ValidationError 로 거부한다",
		async (rule) => {
			const limiter = new MemoryRateLimiter(new FakeClock());
			await expect(limiter.hit("k", rule)).rejects.toBeInstanceOf(
				ValidationError,
			);
		},
	);

	test("시계가 뒤로 갔다 돌아와도 이미 센 시간을 다시 보충하지 않는다", async () => {
		const clock = new FakeClock();
		const limiter = new MemoryRateLimiter(clock);
		const rule = { capacity: 1, refillPerSecond: 1 };
		const start = clock.now();
		expect((await limiter.hit("k", rule)).allowed).toBe(true);
		clock.set(new Date(start.getTime() - 5000));
		expect((await limiter.hit("k", rule)).allowed).toBe(false);
		clock.set(start);
		expect((await limiter.hit("k", rule)).allowed).toBe(false);
		clock.advance(1000);
		expect((await limiter.hit("k", rule)).allowed).toBe(true);
	});
});

describe("MemoryRateLimiter 청소", () => {
	const rule = { capacity: 2, refillPerSecond: 1 };

	test("가득 찬 키만 기회적으로 지우고 아직 비어 있는 키는 남긴다", async () => {
		const clock = new FakeClock();
		const limiter = new MemoryRateLimiter(clock);
		for (let i = 0; i < 100; i += 1) {
			await limiter.hit(`old-${i}`, rule);
		}
		expect(limiter.trackedKeys).toBe(100);
		// old-* 는 1초 안에 가득 찬다. busy 는 방금 쓴 것이라 아직 안 찼다.
		clock.advance(10_000);
		await limiter.hit("busy", rule);
		// 256 번째 호출에서 청소가 돈다(100 + 1 + 155).
		for (let i = 0; i < 155; i += 1) {
			await limiter.hit("hot", rule);
		}
		expect(limiter.trackedKeys).toBe(2);
	});

	test("지워진 키는 없는 키처럼 가득 찬 버킷으로 다시 시작한다", async () => {
		const clock = new FakeClock();
		const limiter = new MemoryRateLimiter(clock);
		await limiter.hit("k", rule);
		clock.advance(10_000);
		for (let i = 0; i < 255; i += 1) {
			await limiter.hit("other", rule);
		}
		expect(await limiter.hit("k", rule)).toEqual({
			allowed: true,
			remaining: 1,
		});
	});
});
