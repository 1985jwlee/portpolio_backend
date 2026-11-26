import { type Faults, ValidationError } from "@pf/kernel";
import type { FaultPoint } from "./fault-points.ts";

/** 지점에서 멈춰 선 흐름을 시험이 붙잡고 푸는 손잡이. `sleep` 없이 순서를 강제한다. */
export type Gate = {
	/** 어떤 흐름이 이 지점에 도달하면 이행된다. */
	readonly reached: Promise<void>;
	/** 멈춰 있던 흐름들을 모두 푼다. 이후 도달하는 흐름도 멈추지 않는다. */
	release(): void;
};

export class InjectedFaultError extends Error {
	constructor(point: string, nth: number) {
		super(`주입된 장애: ${point} (${nth}번째 도달)`);
		this.name = "InjectedFaultError";
	}
}

type GateState = {
	readonly gate: Gate;
	readonly markReached: () => void;
	readonly released: Promise<void>;
	readonly release: () => void;
};

function createGate(): GateState {
	let markReached: () => void = () => {};
	let release: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		markReached = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		gate: { reached, release: () => release() },
		markReached,
		released,
		release,
	};
}

export class FaultInjector implements Faults {
	#hits = new Map<string, number>();
	#failures = new Map<string, Set<number>>();
	#gates = new Map<string, GateState>();

	/** `point` 의 `nth`(1부터) 번째 도달에서만 `InjectedFaultError` 를 던진다. */
	failAt(point: FaultPoint, nth = 1): void {
		if (!Number.isInteger(nth) || nth < 1) {
			throw new ValidationError({
				message: "failAt 의 nth 는 1 이상의 정수여야 한다",
				details: { nth },
			});
		}
		const nths = this.#failures.get(point) ?? new Set<number>();
		nths.add(nth);
		this.#failures.set(point, nths);
	}

	/** `point` 에 도달한 흐름을 `release()` 전까지 세워 둔다. 같은 지점을 다시 부르면 새 게이트로 바꾼다. */
	delayAt(point: FaultPoint): Gate {
		const state = createGate();
		this.#gates.set(point, state);
		return state.gate;
	}

	// 코드는 이름을 문자열로 받는다(`Faults` 는 kernel 포트) — 등록하지 않은 이름은 그냥 지나간다.
	async hit(point: string): Promise<void> {
		const count = (this.#hits.get(point) ?? 0) + 1;
		this.#hits.set(point, count);
		if (this.#failures.get(point)?.has(count)) {
			throw new InjectedFaultError(point, count);
		}
		const state = this.#gates.get(point);
		if (state !== undefined) {
			state.markReached();
			await state.released;
		}
	}

	/** 등록과 도달 횟수를 비운다. 멈춰 있던 흐름은 풀어 시험이 매달리지 않게 한다. */
	clear(): void {
		for (const state of this.#gates.values()) {
			state.release();
		}
		this.#hits = new Map();
		this.#failures = new Map();
		this.#gates = new Map();
	}
}
