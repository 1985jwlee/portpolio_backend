// DB 풀 컴포넌트(phase 10) — 시작에서 풀을 만들고 `SELECT 1` 로 닿는지 확인한다. 닿지 않으면 종료 코드 69 로 기동을 멈춘다.
// 재시도는 하지 않는다 — compose·k8s 의 재시작 정책이 같은 일을 하고, 여기서 기다리면 종료 신호 처리가 늦어진다.
import { createDbPool, type DbPool, ping } from "@pf/db";
import { type Component, describeError, ExitCodeError } from "./component.ts";
import { EXIT_CODES } from "./exit-codes.ts";

// 기동 확인의 ping 한도 — 연결 수립(TLS 포함)까지 걸리므로 readyz 의 500ms 보다 넉넉하게 둔다.
const STARTUP_PING_TIMEOUT_MS = 5_000;

export class DbPoolComponent implements Component {
	readonly name = "dbPool";
	readonly phase = 10;
	readonly #url: string;
	#pool: DbPool | undefined;

	constructor(url: string) {
		this.#url = url;
	}

	/** 시작 전에 부르면 프로그래머 오류다 — 조립이 phase 순서로 이 컴포넌트를 먼저 시작한다. */
	get pool(): DbPool {
		if (this.#pool === undefined) {
			throw new Error("DbPoolComponent 가 아직 시작되지 않았다");
		}
		return this.#pool;
	}

	async start(): Promise<void> {
		const pool = createDbPool({ url: this.#url });
		const alive = await ping(pool, STARTUP_PING_TIMEOUT_MS);
		if (!alive.ok) {
			// 닿지 않는 풀을 들고 있지 않는다 — 기다릴 질의가 없으므로 바로 닫는다.
			await pool.close(0);
			throw new ExitCodeError(
				EXIT_CODES.DB_UNAVAILABLE,
				`DB 에 연결할 수 없다: ${describeError(alive.error)}`,
				{ cause: alive.error },
			);
		}
		this.#pool = pool;
	}

	async stop(deadlineMs: number): Promise<void> {
		await this.#pool?.close(deadlineMs);
	}
}
