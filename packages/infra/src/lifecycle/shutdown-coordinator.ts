// 종료 신호 처리(F16 §9.5) — draining 을 켜고 grace 안에서 컴포넌트를 역순 정지한다. 끝나면 0, grace 를 넘기거나 정지가 실패하면 1.
import { describeError, type LifecycleLog } from "./component.ts";
import { EXIT_CODES } from "./exit-codes.ts";

// grace 25초 — Compose stop_grace_period 30초·k8s terminationGracePeriodSeconds 30초보다 짧게 둔다(F16 §9.5).
const DEFAULT_GRACE_MS = 25_000;

export type ShutdownOptions = {
	readonly root: { stop(deadlineMs: number): Promise<void> };
	/** readyz 가 가장 먼저 503 이 되게 하는 스위치 — observability 의 HealthRegistry 가 구조적으로 만족한다. */
	readonly draining: { setDraining(flag: boolean): void };
	readonly log: LifecycleLog;
	/** 프로세스를 끝내는 함수 — 운영에서는 `process.exit`, 시험에서는 기록용 가짜. */
	readonly exit: (code: number) => void;
	readonly graceMs?: number;
	/** draining 을 켠 뒤 서버를 연 채로 기다리는 시간(ms) — 로드밸런서가 readyz 503 을 보고 새 트래픽을 빼는 데 걸리는 시간이다. 0(기본)이면 기다리지 않는다. grace 안에서 쓴다(grace 를 넘으면 grace 로 자른다). */
	readonly drainDelayMs?: number;
};

export class ShutdownCoordinator {
	readonly graceMs: number;
	readonly drainDelayMs: number;
	readonly #options: ShutdownOptions;
	#running: Promise<number> | undefined;

	constructor(options: ShutdownOptions) {
		this.#options = options;
		this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
		this.drainDelayMs = Math.min(
			Math.max(options.drainDelayMs ?? 0, 0),
			this.graceMs,
		);
	}

	/** 신호 처리기를 건다. 첫 신호가 종료를 시작하고 이후 신호는 로그만 남는다. */
	install(signals: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"]): void {
		for (const signal of signals) {
			process.on(signal, () => {
				void this.trigger(signal);
			});
		}
	}

	/** 종료를 시작한다. 이미 시작했으면 로그만 남기고 같은 결과를 돌려준다. 돌려주는 값은 `exit` 에 넘긴 코드다. */
	trigger(reason: string): Promise<number> {
		if (this.#running !== undefined) {
			this.#options.log.info("shutdown already in progress", { reason });
			return this.#running;
		}
		this.#running = this.#run(reason);
		return this.#running;
	}

	/** draining 을 켠 채 drainDelayMs 만큼 기다린 뒤, 남은 grace 로 정지한다. */
	async #drainThenStop(root: ShutdownOptions["root"]): Promise<void> {
		if (this.drainDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.drainDelayMs));
		}
		await root.stop(this.graceMs - this.drainDelayMs);
	}

	async #run(reason: string): Promise<number> {
		const { root, draining, log, exit } = this.#options;
		log.info("shutdown start", { reason, grace_ms: this.graceMs });
		draining.setDraining(true);

		let timer: ReturnType<typeof setTimeout> | undefined;
		const expired = new Promise<"forced">((resolve) => {
			timer = setTimeout(() => resolve("forced"), this.graceMs);
		});
		const stopped = this.#drainThenStop(root).then(
			() => "stopped" as const,
			(error: unknown) => {
				log.error("shutdown stop failed", { error: describeError(error) });
				return "failed" as const;
			},
		);
		const outcome = await Promise.race([stopped, expired]);
		clearTimeout(timer);

		const code = outcome === "stopped" ? EXIT_CODES.OK : EXIT_CODES.FAILURE;
		log.info("shutdown end", { outcome, exit_code: code });
		exit(code);
		return code;
	}
}
