// 생명주기(L2) — 시작 순서·역순 정지·실패 전파·종료 조정. 가짜 컴포넌트가 호출 순서를 기록한다(F16 §9.9).
import { describe, expect, test } from "bun:test";
import {
	type Component,
	CompositionRoot,
	DbPoolComponent,
	EXIT_CODES,
	ExitCodeError,
	exitCodeOf,
	type LifecycleLog,
	runRoot,
	ShutdownCoordinator,
} from "@pf/infra";

type Logged = { readonly level: string; readonly msg: string };

function recordingLog(): LifecycleLog & { readonly lines: Logged[] } {
	const lines: Logged[] = [];
	return {
		lines,
		info: (msg) => lines.push({ level: "info", msg }),
		error: (msg) => lines.push({ level: "error", msg }),
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 시험이 건 신호 처리기만 걷어 낸다 — install 이 process 에 건 것이 다음 시험으로 새지 않게 한다.
async function keepingSignalListeners<T>(run: () => Promise<T>): Promise<T> {
	const signals: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
	const original = signals.map((signal) => [...process.listeners(signal)]);
	try {
		return await run();
	} finally {
		signals.forEach((signal, index) => {
			for (const listener of process.listeners(signal)) {
				if (!original[index]?.includes(listener)) {
					process.removeListener(signal, listener);
				}
			}
		});
	}
}

type Behavior = {
	readonly failStart?: boolean;
	readonly failStop?: boolean;
	readonly stopTakesMs?: number;
};

// 호출을 `events` 에 `시작:이름` · `정지:이름` 으로 남기는 컴포넌트.
function fake(
	events: string[],
	name: string,
	phase: number,
	behavior: Behavior = {},
	deadlines?: Map<string, number>,
): Component {
	return {
		name,
		phase,
		async start() {
			events.push(`시작:${name}`);
			if (behavior.failStart) {
				throw new Error(`${name} 시작 실패`);
			}
		},
		async stop(deadlineMs) {
			events.push(`정지:${name}`);
			deadlines?.set(name, deadlineMs);
			if (behavior.stopTakesMs !== undefined) {
				await sleep(behavior.stopTakesMs);
			}
			if (behavior.failStop) {
				throw new Error(`${name} 정지 실패`);
			}
		},
	};
}

class TestRoot extends CompositionRoot {
	readonly #components: readonly Component[];

	constructor(log: LifecycleLog, components: readonly Component[]) {
		super(log);
		this.#components = components;
	}

	protected override build(): readonly Component[] {
		return this.#components;
	}
}

describe("CompositionRoot 시작", () => {
	test("phase 오름차순으로 시작하고 같은 phase 는 build 순서를 지킨다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [
			fake(events, "http", 40),
			fake(events, "modules-a", 30),
			fake(events, "dbPool", 10),
			fake(events, "modules-b", 30),
		]);
		await root.start();
		expect(events).toEqual([
			"시작:dbPool",
			"시작:modules-a",
			"시작:modules-b",
			"시작:http",
		]);
	});

	test("하나가 실패하면 이미 시작한 것만 역순으로 정지하고 그 실패를 그대로 던진다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [
			fake(events, "dbPool", 10),
			fake(events, "modules", 30),
			fake(events, "http", 40, { failStart: true }),
			fake(events, "readiness", 50),
		]);
		await expect(root.start()).rejects.toThrow("http 시작 실패");
		// 실패한 http 는 시작된 것이 아니라 정지 대상이 아니고, 뒤의 readiness 는 시작조차 하지 않는다.
		expect(events).toEqual([
			"시작:dbPool",
			"시작:modules",
			"시작:http",
			"정지:modules",
			"정지:dbPool",
		]);
	});

	test("정리 중 정지가 실패해도 기동 실패의 원인이 가려지지 않는다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [
			fake(events, "dbPool", 10, { failStop: true }),
			fake(events, "http", 40, { failStart: true }),
		]);
		await expect(root.start()).rejects.toThrow("http 시작 실패");
	});

	test("start 를 두 번 부르면 던진다", async () => {
		const root = new TestRoot(recordingLog(), []);
		await root.start();
		await expect(root.start()).rejects.toThrow();
	});
});

describe("CompositionRoot 정지", () => {
	test("시작의 역순으로 정지한다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [
			fake(events, "a", 10),
			fake(events, "b", 30),
			fake(events, "c", 50),
		]);
		await root.start();
		events.length = 0;
		await root.stop(1_000);
		expect(events).toEqual(["정지:c", "정지:b", "정지:a"]);
	});

	test("하나가 실패해도 나머지를 정지하고 실패를 모아 던진다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [
			fake(events, "a", 10),
			fake(events, "b", 30, { failStop: true }),
			fake(events, "c", 50),
		]);
		await root.start();
		events.length = 0;
		const thrown = await root.stop(1_000).catch((error: unknown) => error);
		expect(thrown).toBeInstanceOf(AggregateError);
		expect(events).toEqual(["정지:c", "정지:b", "정지:a"]);
	});

	test("각 컴포넌트는 남은 기한을 받는다 — 앞 컴포넌트가 쓴 시간만큼 줄어든다", async () => {
		const events: string[] = [];
		const deadlines = new Map<string, number>();
		const root = new TestRoot(recordingLog(), [
			fake(events, "first-started", 10, {}, deadlines),
			fake(events, "last-started", 50, { stopTakesMs: 80 }, deadlines),
		]);
		await root.start();
		await root.stop(1_000);
		const slow = deadlines.get("last-started") ?? Number.NaN;
		const next = deadlines.get("first-started") ?? Number.NaN;
		expect(slow).toBeLessThanOrEqual(1_000);
		expect(slow).toBeGreaterThan(900);
		// 80ms 를 쓴 뒤라 다음 컴포넌트가 받는 기한은 첫 컴포넌트보다 확실히 작다.
		expect(next).toBeLessThan(slow - 50);
	});

	test("두 번째 stop 은 정지할 것이 없어 아무것도 하지 않는다", async () => {
		const events: string[] = [];
		const root = new TestRoot(recordingLog(), [fake(events, "a", 10)]);
		await root.start();
		await root.stop(1_000);
		events.length = 0;
		await root.stop(1_000);
		expect(events).toEqual([]);
	});
});

describe("ShutdownCoordinator", () => {
	function coordinatorOver(
		events: string[],
		components: readonly Component[],
		graceMs: number,
		drainDelayMs?: number,
	) {
		const log = recordingLog();
		const exits: number[] = [];
		const root = new TestRoot(log, components);
		const coordinator = new ShutdownCoordinator({
			root,
			draining: { setDraining: (flag) => events.push(`draining:${flag}`) },
			log,
			exit: (code) => exits.push(code),
			graceMs,
			...(drainDelayMs === undefined ? {} : { drainDelayMs }),
		});
		return { root, coordinator, exits, log };
	}

	test("draining 을 먼저 켜고 그 뒤에 역순 정지하며 정상이면 0 으로 끝난다", async () => {
		const events: string[] = [];
		const { root, coordinator, exits } = coordinatorOver(
			events,
			[fake(events, "dbPool", 10), fake(events, "http", 40)],
			1_000,
		);
		await root.start();
		events.length = 0;
		const code = await coordinator.trigger("SIGTERM");
		expect(events).toEqual(["draining:true", "정지:http", "정지:dbPool"]);
		expect(code).toBe(EXIT_CODES.OK);
		expect(exits).toEqual([0]);
	});

	test("drainDelayMs 동안 draining 을 켠 채 정지를 미루고, 그 뒤 정상이면 0 으로 끝난다(readyz 503 구간)", async () => {
		const events: string[] = [];
		const { root, coordinator, exits } = coordinatorOver(
			events,
			[fake(events, "http", 10)],
			1_000,
			150,
		);
		await root.start();
		events.length = 0;
		const start = performance.now();
		const pending = coordinator.trigger("SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 60));
		// 지연 중에는 draining 만 켜졌고 서버는 아직 멈추지 않았다.
		expect(events).toEqual(["draining:true"]);
		const code = await pending;
		expect(events).toEqual(["draining:true", "정지:http"]);
		expect(performance.now() - start).toBeGreaterThanOrEqual(140);
		expect(code).toBe(EXIT_CODES.OK);
		expect(exits).toEqual([0]);
	});

	test("drainDelayMs 가 grace 보다 크면 grace 로 자르고, 기본(0)은 기다리지 않는다", async () => {
		const events: string[] = [];
		const { coordinator } = coordinatorOver(events, [], 80, 10_000);
		expect(coordinator.drainDelayMs).toBe(80);
		const { coordinator: plain } = coordinatorOver([], [], 80);
		expect(plain.drainDelayMs).toBe(0);
	});

	test("grace 를 넘기면 정지가 끝나지 않았어도 종료 코드 1 로 끝낸다", async () => {
		const events: string[] = [];
		const { root, coordinator, exits } = coordinatorOver(
			events,
			[fake(events, "stuck", 10, { stopTakesMs: 2_000 })],
			50,
		);
		await root.start();
		const start = performance.now();
		const code = await coordinator.trigger("SIGTERM");
		expect(code).toBe(EXIT_CODES.FAILURE);
		expect(exits).toEqual([1]);
		// 2초짜리 정지를 기다렸다면 grace 가 걸리지 않은 것이다.
		expect(performance.now() - start).toBeLessThan(1_000);
	});

	test("정지가 실패하면 종료 코드 1 이다", async () => {
		const events: string[] = [];
		const { root, coordinator, exits } = coordinatorOver(
			events,
			[fake(events, "a", 10, { failStop: true })],
			1_000,
		);
		await root.start();
		await coordinator.trigger("SIGTERM");
		expect(exits).toEqual([1]);
	});

	test("두 번째 신호는 로그만 남기고 종료를 다시 시작하지 않는다", async () => {
		const events: string[] = [];
		const { root, coordinator, exits, log } = coordinatorOver(
			events,
			[fake(events, "a", 10, { stopTakesMs: 30 })],
			1_000,
		);
		await root.start();
		events.length = 0;
		const first = coordinator.trigger("SIGTERM");
		const second = coordinator.trigger("SIGINT");
		await Promise.all([first, second]);
		expect(events).toEqual(["draining:true", "정지:a"]);
		expect(exits).toEqual([0]);
		expect(
			log.lines.some((l) => l.msg === "shutdown already in progress"),
		).toBe(true);
	});

	describe("신호 처리기", () => {
		test("install 이 건 처리기가 신호를 받으면 종료를 시작한다", async () => {
			await keepingSignalListeners(async () => {
				const events: string[] = [];
				const { coordinator, exits } = coordinatorOver(
					events,
					[fake(events, "a", 10)],
					1_000,
				);
				coordinator.install(["SIGTERM"]);
				process.emit("SIGTERM");
				await coordinator.trigger("확인");
				expect(events).toContain("draining:true");
				expect(exits).toEqual([0]);
			});
		});

		test("runRoot 는 시작이 성공하면 종료하지 않고 신호 처리기를 건다", async () => {
			await keepingSignalListeners(async () => {
				const events: string[] = [];
				const exits: number[] = [];
				const log = recordingLog();
				const sigtermBefore = process.listenerCount("SIGTERM");
				await runRoot({
					root: new TestRoot(log, [fake(events, "a", 10)]),
					draining: { setDraining: () => undefined },
					log,
					exit: (code) => exits.push(code),
				});
				expect(exits).toEqual([]);
				expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);
			});
		});
	});
});

describe("runRoot 시작 실패", () => {
	function exitCodesAfterFailure(error: Error): Promise<number[]> {
		return keepingSignalListeners(async () => {
			const exits: number[] = [];
			const log = recordingLog();
			const failing: Component = {
				name: "failing",
				phase: 10,
				start: async () => {
					throw error;
				},
				stop: async () => undefined,
			};
			await runRoot({
				root: new TestRoot(log, [failing]),
				draining: { setDraining: () => undefined },
				log,
				exit: (code) => exits.push(code),
			});
			return exits;
		});
	}

	test("종료 코드를 실은 실패는 그 코드로 끝난다", async () => {
		expect(
			await exitCodesAfterFailure(
				new ExitCodeError(EXIT_CODES.DB_UNAVAILABLE, "DB 불가"),
			),
		).toEqual([69]);
	});

	test("코드가 없는 실패는 내부 오류 70 이다", async () => {
		expect(await exitCodesAfterFailure(new Error("모름"))).toEqual([70]);
		expect(exitCodeOf(new Error("모름"))).toBe(EXIT_CODES.INTERNAL);
	});
});

describe("DbPoolComponent", () => {
	test("닿지 않는 DB 는 종료 코드 69 의 ExitCodeError 로 기동을 멈춘다", async () => {
		const component = new DbPoolComponent("postgres://u:p@127.0.0.1:1/none");
		const thrown = await component.start().catch((error: unknown) => error);
		expect(thrown).toBeInstanceOf(ExitCodeError);
		expect(exitCodeOf(thrown)).toBe(EXIT_CODES.DB_UNAVAILABLE);
	});

	test("시작 전에 pool 을 꺼내면 던지고, 시작하지 않은 채 stop 해도 안전하다", async () => {
		const component = new DbPoolComponent("postgres://u:p@127.0.0.1:1/none");
		expect(() => component.pool).toThrow();
		await component.stop(0);
	});
});
