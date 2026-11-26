// WorkerRoot — worker 의 조립 루트. phase: config(0) → dbPool(10) → http(40) → readiness(50).
// 잡 스케줄러·리스너는 그것을 쓰는 행이 컴포넌트로 더한다. worker 의 헬스는 `/healthz` 하나이고 DB 확인을 포함한다(F17 §5.1).
import { summarize } from "@pf/config";
import { ping } from "@pf/db";
import {
	type Component,
	CompositionRoot,
	ConfigComponent,
	DbPoolComponent,
	HttpServerComponent,
	ReadinessComponent,
} from "@pf/infra";
import type { Clock, IdGenerator } from "@pf/kernel";
import {
	HealthRegistry,
	LogContext,
	Logger,
	type LogSink,
	Redactor,
	RequestLogger,
} from "@pf/observability";
import pkg from "../../package.json" with { type: "json" };
import type { WorkerConfig } from "../config.ts";
import { createWorkerRoutes, errorResponse } from "./routes.ts";

// healthz 의 DB 확인 한도 — api 의 readyz 와 같은 값이다(F17 §5.1).
const HEALTHZ_DB_TIMEOUT_MS = 500;

export type WorkerRootOptions = {
	readonly config: WorkerConfig;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly sink: LogSink;
};

export class WorkerRoot extends CompositionRoot {
	readonly log: Logger;
	readonly health: HealthRegistry;
	readonly #options: WorkerRootOptions;
	/** 시험이 풀을 닫아 "DB 중단" 을 재현할 수 있게 연다. */
	readonly dbPool: DbPoolComponent;
	readonly #http: HttpServerComponent;
	readonly #requests: RequestLogger;
	readonly #routes: (request: Request) => Promise<Response>;

	constructor(options: WorkerRootOptions) {
		const context = new LogContext();
		const log = new Logger({
			app: "worker",
			level: options.config.LOG_LEVEL,
			clock: options.clock,
			sink: options.sink,
			redactor: new Redactor(),
			context,
		});
		super(log);
		this.#options = options;
		this.log = log;
		this.health = new HealthRegistry(pkg.version);
		this.health.setDraining(true);
		this.dbPool = new DbPoolComponent(options.config.DATABASE_URL.reveal());
		this.health.registerLiveness({
			name: "db",
			critical: true,
			run: async () =>
				(await ping(this.dbPool.pool, HEALTHZ_DB_TIMEOUT_MS)).ok
					? { status: "ok" }
					: { status: "fail", detail: "unreachable" },
		});
		this.#requests = new RequestLogger({
			log,
			context,
			ids: options.ids,
			failureResponse: (traceId) =>
				errorResponse(500, "internal_error", "Internal Server Error", traceId),
		});
		this.#routes = createWorkerRoutes({
			health: this.health,
			traceId: () => context.current().traceId ?? options.ids.next(),
		});
		this.#http = new HttpServerComponent({
			port: options.config.WORKER_PORT,
			fetch: (request) => this.handle(request),
		});
	}

	/** 요청 한 건을 처리한다 — 소켓 없이도 부를 수 있다. */
	handle(request: Request): Promise<Response> {
		return this.#requests.handle(request, this.#routes);
	}

	/** 시작 뒤에 열린 포트(`WORKER_PORT` 가 0 이면 운영체제가 고른 값). */
	get port(): number {
		return this.#http.port;
	}

	protected override build(): readonly Component[] {
		return [
			new ConfigComponent(this.log, summarize(this.#options.config)),
			this.dbPool,
			this.#http,
			new ReadinessComponent(this.health),
		];
	}
}
