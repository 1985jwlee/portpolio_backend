// KeyValueCache 계약 스위트. 시험 파일이 아니다(이름에 .test 없음).
import { describe, expect, test } from "bun:test";
import type { KeyValueCache } from "@pf/kernel";
import { FakeClock } from "@pf/testkit";

export function runKeyValueCacheContract(
	name: string,
	factory: (clock: FakeClock, capacity: number) => KeyValueCache<string>,
): void {
	describe(`KeyValueCache 계약 — ${name}`, () => {
		test("set 한 값을 get 하고 없는 키는 undefined 다", () => {
			const cache = factory(new FakeClock(), 10);
			cache.set("a", "1", 1000);
			expect(cache.get("a")).toBe("1");
			expect(cache.get("none")).toBeUndefined();
		});

		test("TTL 경계 — ttlMs−1 은 살아 있고 ttlMs 에 만료한다", () => {
			const clock = new FakeClock();
			const cache = factory(clock, 10);
			cache.set("a", "1", 1000);
			clock.advance(999);
			expect(cache.get("a")).toBe("1");
			clock.advance(1);
			expect(cache.get("a")).toBeUndefined();
		});

		test("읽어도 TTL 이 늘지 않는다 — 만료 기준은 set 시각이다", () => {
			const clock = new FakeClock();
			const cache = factory(clock, 10);
			cache.set("a", "1", 1000);
			clock.advance(600);
			expect(cache.get("a")).toBe("1");
			clock.advance(400);
			expect(cache.get("a")).toBeUndefined();
		});

		test("같은 키를 다시 set 하면 값과 TTL 이 새로 시작한다", () => {
			const clock = new FakeClock();
			const cache = factory(clock, 10);
			cache.set("a", "1", 1000);
			clock.advance(900);
			cache.set("a", "2", 1000);
			clock.advance(900);
			expect(cache.get("a")).toBe("2");
		});

		test("용량을 넘기면 가장 오래 안 쓴 키를 버린다", () => {
			const cache = factory(new FakeClock(), 2);
			cache.set("a", "1", 1000);
			cache.set("b", "2", 1000);
			cache.set("c", "3", 1000);
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("2");
			expect(cache.get("c")).toBe("3");
		});

		test("읽은 키는 최근 사용으로 쳐서 남긴다", () => {
			const cache = factory(new FakeClock(), 2);
			cache.set("a", "1", 1000);
			cache.set("b", "2", 1000);
			expect(cache.get("a")).toBe("1");
			cache.set("c", "3", 1000);
			expect(cache.get("b")).toBeUndefined();
			expect(cache.get("a")).toBe("1");
		});

		test("invalidate 는 그 키만 지우고 없는 키는 무시한다", () => {
			const cache = factory(new FakeClock(), 10);
			cache.set("a", "1", 1000);
			cache.set("b", "2", 1000);
			cache.invalidate("a");
			cache.invalidate("ghost");
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("2");
		});
	});
}
