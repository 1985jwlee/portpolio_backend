// RateLimiter 계약 스위트(F16 PortContractSuite) — 어댑터 팩토리를 받아 같은 시험을 돌린다. 시험 파일이 아니다(이름에 .test 없음).
import { describe, expect, test } from "bun:test";
import type { RateLimiter, RateRule } from "@pf/kernel";
import { FakeClock } from "@pf/testkit";

const RULE: RateRule = { capacity: 3, refillPerSecond: 1 };

export function runRateLimiterContract(
	name: string,
	factory: (clock: FakeClock) => RateLimiter,
): void {
	describe(`RateLimiter 계약 — ${name}`, () => {
		test("N 번째까지 허용하고 N+1 번째는 거절한다(남은 수·재시도 시간 포함)", async () => {
			const limiter = factory(new FakeClock());
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: true,
				remaining: 2,
			});
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: true,
				remaining: 1,
			});
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: true,
				remaining: 0,
			});
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: false,
				retryAfterMs: 1000,
			});
		});

		test("정확히 토큰 하나 분량이 지나야 다시 허용한다 — 1ms 모자라면 거절", async () => {
			const clock = new FakeClock();
			const limiter = factory(clock);
			for (let i = 0; i < 3; i += 1) {
				await limiter.hit("k", RULE);
			}
			clock.advance(999);
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: false,
				retryAfterMs: 1,
			});
			clock.advance(1);
			expect(await limiter.hit("k", RULE)).toEqual({
				allowed: true,
				remaining: 0,
			});
		});

		test("거절된 호출 사이에도 소수 토큰은 쌓인다", async () => {
			const clock = new FakeClock();
			const limiter = factory(clock);
			const rule: RateRule = { capacity: 1, refillPerSecond: 2 };
			expect((await limiter.hit("k", rule)).allowed).toBe(true);
			clock.advance(250);
			expect(await limiter.hit("k", rule)).toEqual({
				allowed: false,
				retryAfterMs: 250,
			});
			clock.advance(250);
			expect((await limiter.hit("k", rule)).allowed).toBe(true);
		});

		test("오래 비워 둬도 capacity 를 넘겨 쌓이지 않는다", async () => {
			const clock = new FakeClock();
			const limiter = factory(clock);
			await limiter.hit("k", RULE);
			clock.advance(3_600_000);
			for (let i = 0; i < 3; i += 1) {
				expect((await limiter.hit("k", RULE)).allowed).toBe(true);
			}
			expect((await limiter.hit("k", RULE)).allowed).toBe(false);
		});

		test("키는 서로 격리된다", async () => {
			const limiter = factory(new FakeClock());
			for (let i = 0; i < 3; i += 1) {
				await limiter.hit("a", RULE);
			}
			expect((await limiter.hit("a", RULE)).allowed).toBe(false);
			expect(await limiter.hit("b", RULE)).toEqual({
				allowed: true,
				remaining: 2,
			});
		});
	});
}
