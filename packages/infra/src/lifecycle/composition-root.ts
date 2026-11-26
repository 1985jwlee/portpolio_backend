// 조립 루트의 시작·정지 골격(템플릿 메서드, F16 §9.7) — 하위 클래스는 `build()` 로 컴포넌트만 내놓는다.
// 시작은 phase 오름차순 순차, 하나가 실패하면 이미 시작한 것만 역순으로 정지하고 그 실패를 그대로 던진다.
import {
	type Component,
	describeError,
	type LifecycleLog,
} from "./component.ts";

// 기동 실패 뒤 정리에 주는 기한 — 프로세스가 곧 종료되므로 길게 기다리지 않는다.
const START_FAILURE_STOP_MS = 5_000;

export abstract class CompositionRoot {
	readonly #log: LifecycleLog;
	#started: Component[] = [];
	#begun = false;

	protected constructor(log: LifecycleLog) {
		this.#log = log;
	}

	/** 이 앱의 컴포넌트를 조립한다. start 에서 한 번만 불린다. */
	protected abstract build(): readonly Component[];

	async start(): Promise<void> {
		if (this.#begun) {
			throw new Error("CompositionRoot.start 는 한 번만 부를 수 있다");
		}
		this.#begun = true;
		// 같은 phase 는 build 가 내놓은 순서를 지킨다(Array.sort 는 안정 정렬이다).
		const ordered = [...this.build()].sort((a, b) => a.phase - b.phase);
		for (const component of ordered) {
			this.#log.info("component start", {
				phase: "start",
				component: component.name,
				order: component.phase,
			});
			try {
				await component.start();
			} catch (error) {
				this.#log.error("component start failed", {
					component: component.name,
					error: describeError(error),
				});
				// 정리가 실패해도 기동 실패의 원인이 가려지면 안 된다 — stop 이 모은 오류는 이미 로그에 있다.
				await this.stop(START_FAILURE_STOP_MS).catch(() => undefined);
				throw error;
			}
			this.#started.push(component);
		}
	}

	/** 시작된 컴포넌트를 phase 내림차순으로 정지한다. 하나가 실패해도 나머지는 정지하고, 실패는 모아 던진다. */
	async stop(deadlineMs: number): Promise<void> {
		const deadlineAt = performance.now() + deadlineMs;
		const failures: unknown[] = [];
		const reversed = [...this.#started].reverse();
		this.#started = [];
		for (const component of reversed) {
			const remaining = Math.max(0, deadlineAt - performance.now());
			this.#log.info("component stop", {
				phase: "stop",
				component: component.name,
				deadline_ms: Math.round(remaining),
			});
			try {
				await component.stop(remaining);
			} catch (error) {
				failures.push(error);
				this.#log.error("component stop failed", {
					component: component.name,
					error: describeError(error),
				});
			}
		}
		if (failures.length > 0) {
			throw new AggregateError(failures, "컴포넌트 정지 중 실패가 있었다");
		}
	}
}
