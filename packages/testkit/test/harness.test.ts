import { describe, expect, test } from "bun:test";
import {
	ChaosHarness,
	ModuleHarness,
	TestHarness,
	UnitHarness,
	WorkerHarness,
} from "../src/index.ts";

describe("하니스 (DB 없이 도는 부분 — L2)", () => {
	test("UnitHarness 는 빈 시험에서 setup·teardown 이 돈다", async () => {
		const harness = new UnitHarness();
		expect(harness).toBeInstanceOf(TestHarness);
		await harness.setup();
		harness.clock.advance(10);
		expect(harness.ids.next()).toBeString();
		await harness.teardown();
	});

	test("DB 계열 하니스는 TestHarness 를 잇고 시작 전에는 DB 를 만들지 않는다", () => {
		const url = "postgres://u:p@127.0.0.1:1/postgres";
		expect(new ModuleHarness(url)).toBeInstanceOf(TestHarness);
		expect(new ChaosHarness(url)).toBeInstanceOf(TestHarness);
		expect(() => new ModuleHarness(url).db.url()).toThrow();
	});

	test("WorkerHarness: spawn 한 워커를 한 단계씩 돌리고 kill 하면 더는 돌지 않는다", async () => {
		const workers = new WorkerHarness();
		let steps = 0;
		const handle = workers.spawn("w1", async () => {
			steps += 1;
		});
		await workers.runOnce(handle);
		await workers.runOnce(handle);
		expect(steps).toBe(2);
		workers.kill(handle);
		await expect(workers.runOnce(handle)).rejects.toThrow();
		expect(steps).toBe(2);
	});
});
