// PresenceCounter 계약 스위트. 시험 파일이 아니다(이름에 .test 없음).
import { describe, expect, test } from "bun:test";
import type { PresenceCounter } from "@pf/kernel";

export function runPresenceCounterContract(
	name: string,
	factory: () => PresenceCounter,
): void {
	describe(`PresenceCounter 계약 — ${name}`, () => {
		test("처음에는 0 이고 join·leave 가 센다", () => {
			const counter = factory();
			expect(counter.count()).toBe(0);
			counter.join("a");
			counter.join("b");
			expect(counter.count()).toBe(2);
			counter.leave("a");
			expect(counter.count()).toBe(1);
		});

		test("같은 연결 id 를 두 번 join 해도 하나로 센다", () => {
			const counter = factory();
			counter.join("a");
			counter.join("a");
			expect(counter.count()).toBe(1);
			counter.leave("a");
			expect(counter.count()).toBe(0);
		});

		test("없는 연결 id 의 leave 는 무시한다", () => {
			const counter = factory();
			counter.join("a");
			counter.leave("ghost");
			expect(counter.count()).toBe(1);
		});

		test("leave 한 연결은 다시 join 하면 센다", () => {
			const counter = factory();
			counter.join("a");
			counter.leave("a");
			counter.join("a");
			expect(counter.count()).toBe(1);
		});
	});
}
