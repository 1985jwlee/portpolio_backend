import { describe, expect, test } from "bun:test";
import {
	FAULT_POINTS,
	FaultInjector,
	InjectedFaultError,
} from "../src/index.ts";

const POINT = FAULT_POINTS.OUTBOX_DISPATCHER_AFTER_CLAIM;
const OTHER = FAULT_POINTS.OUTBOX_WRITER_BEFORE_APPEND;

// 한 틱 안에 끝났는지 본다 — 매달린 약속은 영영 이행되지 않으므로 짧은 상한이면 충분하다.
async function settled(promise: Promise<void>): Promise<boolean> {
	return Promise.race([
		promise.then(() => true),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
	]);
}

describe("FaultInjector", () => {
	test("등록이 없으면 hit 는 즉시 끝난다", async () => {
		await new FaultInjector().hit(POINT);
	});

	test("등록하지 않은 이름의 hit 도 던지지 않고 지나간다", async () => {
		await new FaultInjector().hit("module.component.not_registered");
	});

	test("failAt(point, n) 은 n 번째 도달에서만 던지고 다른 지점은 건드리지 않는다", async () => {
		const faults = new FaultInjector();
		faults.failAt(POINT, 2);
		await faults.hit(POINT);
		await expect(faults.hit(POINT)).rejects.toBeInstanceOf(InjectedFaultError);
		await faults.hit(POINT);
		await faults.hit(OTHER);
	});

	test("failAt 의 nth 는 1 이상의 정수여야 한다", () => {
		const faults = new FaultInjector();
		for (const bad of [0, -1, 1.5]) {
			expect(() => faults.failAt(POINT, bad)).toThrow();
		}
	});

	test("delayAt 의 흐름은 release 전까지 매달리고 reached 는 도달 때 이행된다", async () => {
		const faults = new FaultInjector();
		const gate = faults.delayAt(POINT);
		expect(await settled(gate.reached)).toBe(false);

		const flow = faults.hit(POINT);
		await gate.reached;
		expect(await settled(flow)).toBe(false);

		gate.release();
		expect(await settled(flow)).toBe(true);
	});

	test("한 게이트에 모인 여러 흐름이 release 한 번에 함께 풀린다", async () => {
		const faults = new FaultInjector();
		const gate = faults.delayAt(POINT);
		const flows = [faults.hit(POINT), faults.hit(POINT)];
		await gate.reached;
		gate.release();
		expect(await Promise.all(flows.map(settled))).toEqual([true, true]);
	});

	test("release 뒤에 도달하는 흐름은 멈추지 않는다", async () => {
		const faults = new FaultInjector();
		faults.delayAt(POINT).release();
		await faults.hit(POINT);
	});

	test("clear 는 등록을 지우고 멈춘 흐름을 푼다", async () => {
		const faults = new FaultInjector();
		faults.delayAt(POINT);
		faults.failAt(OTHER);
		const flow = faults.hit(POINT);
		faults.clear();
		expect(await settled(flow)).toBe(true);
		await faults.hit(OTHER);
	});
});
