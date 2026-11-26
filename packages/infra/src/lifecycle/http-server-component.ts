// HTTP 서버 컴포넌트(phase 40) — `Bun.serve` 로 요청을 받고, 정지할 때는 신규 수락을 먼저 끊고 진행 중 요청을 기한까지 기다린다(F16 §9.5).
import type { Component } from "./component.ts";

export type HttpServerOptions = {
	/** 0 이면 운영체제가 빈 포트를 고른다(시험). 실제 포트는 시작 뒤 `port` 로 읽는다. */
	readonly port: number;
	readonly fetch: (request: Request) => Response | Promise<Response>;
};

export class HttpServerComponent implements Component {
	readonly name = "http";
	readonly phase = 40;
	readonly #options: HttpServerOptions;
	#server: Bun.Server<undefined> | undefined;

	constructor(options: HttpServerOptions) {
		this.#options = options;
	}

	/** 시작 뒤에 실제로 열린 포트. */
	get port(): number {
		if (this.#server?.port === undefined) {
			throw new Error("HttpServerComponent 가 아직 시작되지 않았다");
		}
		return this.#server.port;
	}

	async start(): Promise<void> {
		this.#server = Bun.serve({
			port: this.#options.port,
			fetch: this.#options.fetch,
		});
	}

	async stop(deadlineMs: number): Promise<void> {
		const server = this.#server;
		if (server === undefined) {
			return;
		}
		// stop() 은 신규 수락을 끊고 진행 중 요청이 끝나면 완료된다. 열린 소켓이 있으면 끝나지 않을 수 있어(F16 §9.5 Bun 실측 주의) 기한을 건다.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const expired = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), deadlineMs);
		});
		const outcome = await Promise.race([
			server.stop().then(() => "stopped" as const),
			expired,
		]);
		clearTimeout(timer);
		if (outcome === "timeout") {
			await server.stop(true);
		}
		this.#server = undefined;
	}
}
