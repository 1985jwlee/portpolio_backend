// 시작·정지에 할 일이 한 줄인 컴포넌트 둘 — 설정 요약 로그(phase 0)와 준비 완료 표시(phase 50).
import type { Component, LifecycleLog } from "./component.ts";

/** 기동 첫 줄에 설정 요약을 남긴다. `summary` 는 비밀을 값이 아니라 이름으로만 담은 것이어야 한다(`@pf/config` 의 summarize). */
export class ConfigComponent implements Component {
	readonly name = "config";
	readonly phase = 0;
	readonly #log: LifecycleLog;
	readonly #summary: Readonly<Record<string, unknown>>;

	constructor(log: LifecycleLog, summary: Readonly<Record<string, unknown>>) {
		this.#log = log;
		this.#summary = summary;
	}

	async start(): Promise<void> {
		this.#log.info("config loaded", this.#summary);
	}

	async stop(): Promise<void> {}
}

/** 마지막에 시작해 draining 을 풀고(readyz 가 200 이 된다), 처음에 정지해 다시 건다. */
export class ReadinessComponent implements Component {
	readonly name = "readiness";
	readonly phase = 50;
	readonly #draining: { setDraining(flag: boolean): void };

	constructor(draining: { setDraining(flag: boolean): void }) {
		this.#draining = draining;
	}

	async start(): Promise<void> {
		this.#draining.setDraining(false);
	}

	async stop(): Promise<void> {
		this.#draining.setDraining(true);
	}
}
