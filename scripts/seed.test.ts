// db:seed 프레임(L2) — production 거절·순서·첫 실패에서 멈춤·시나리오 0개.
import { describe, expect, test } from "bun:test";
import {
	SCENARIOS,
	type SeedContext,
	SeedRunner,
	type SeedScenario,
} from "./seed.ts";

const context: SeedContext = {
	clock: { now: () => new Date("2026-11-26T00:00:00.000Z") },
	ids: { next: () => "00000000-0000-7000-8000-000000000001" },
};

function scenario(name: string, log: string[], fail = false): SeedScenario {
	return {
		name,
		run: async () => {
			log.push(name);
			if (fail) {
				throw new Error(`${name} 실패`);
			}
		},
	};
}

describe("SeedRunner", () => {
	test("production 만 거절한다", () => {
		const runner = new SeedRunner();
		expect(runner.guardEnvironment("production")).toBe(false);
		expect(runner.guardEnvironment("development")).toBe(true);
		expect(runner.guardEnvironment("test")).toBe(true);
	});

	test("시나리오를 순서대로 돌린다", async () => {
		const log: string[] = [];
		const outcome = await new SeedRunner().runAll(
			[scenario("a", log), scenario("b", log)],
			context,
		);
		expect(log).toEqual(["a", "b"]);
		expect(outcome).toEqual({ ran: ["a", "b"] });
	});

	test("첫 실패에서 멈추고 실패한 이름을 알린다", async () => {
		const log: string[] = [];
		const outcome = await new SeedRunner().runAll(
			[scenario("a", log), scenario("b", log, true), scenario("c", log)],
			context,
		);
		expect(log).toEqual(["a", "b"]);
		expect(outcome.ran).toEqual(["a"]);
		expect(outcome.failed?.name).toBe("b");
	});

	test("시나리오 0개는 성공이다 — 등록 목록이 지금은 비어 있다", async () => {
		expect(SCENARIOS).toEqual([]);
		expect(await new SeedRunner().runAll([], context)).toEqual({ ran: [] });
	});
});
