import { describe, expect, test } from "bun:test";
import { ValidationError } from "@pf/kernel";
import { FakeClock } from "../src/index.ts";

describe("FakeClock", () => {
	test("advance 는 시각을 앞으로 보내고 단조 증가한다", () => {
		const clock = new FakeClock(new Date("2026-03-01T00:00:00.000Z"));
		const before = clock.now().getTime();
		clock.advance(1500);
		clock.advance(0);
		expect(clock.now().getTime()).toBe(before + 1500);
	});

	test("advance 에 음수·NaN·무한대를 주면 ValidationError 이고 시각은 그대로다", () => {
		const clock = new FakeClock();
		const before = clock.now().getTime();
		for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => clock.advance(bad)).toThrow(ValidationError);
		}
		expect(clock.now().getTime()).toBe(before);
	});

	test("set 은 임의의 시각으로 옮긴다", () => {
		const clock = new FakeClock();
		clock.set(new Date("2030-01-01T00:00:00.000Z"));
		expect(clock.now().toISOString()).toBe("2030-01-01T00:00:00.000Z");
	});

	test("now 가 돌려준 Date 를 바꿔도 시계는 흔들리지 않는다", () => {
		const clock = new FakeClock();
		const first = clock.now();
		first.setFullYear(1999);
		expect(clock.now().getFullYear()).not.toBe(1999);
	});
});
