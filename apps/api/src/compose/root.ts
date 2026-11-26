// ApiRoot — api 의 조립 루트(F16 §9.3). 컴포넌트를 phase 로 늘어놓기만 하고 시작·정지 골격은 CompositionRoot 가 갖는다.
// phase: config(0) → dbPool(10) → modules(30) → http(40) → readiness(50). MigrationCheck 는 등록하지 않는다(DV-027).
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
import type { Clock, Faults, IdGenerator } from "@pf/kernel";
import {
	HealthRegistry,
	LogContext,
	Logger,
	type LogSink,
	Redactor,
	RequestLogger,
} from "@pf/observability";
import pkg from "../../package.json" with { type: "json" };
import type { ApiConfig } from "../config.ts";
import { type ApiPorts, createApiPorts } from "./ports.ts";
import { createApiApp, errorResponse } from "./routes.ts";

// readyz 의 DB 확인 한도(F17 §5.1).
const READYZ_DB_TIMEOUT_MS = 500;

export type ApiRootOptions = {
	readonly config: ApiConfig;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly faults: Faults;
	readonly sink: LogSink;
};

export class ApiRoot extends CompositionRoot {
	readonly log: Logger;
	readonly health: HealthRegistry;
	readonly #options: ApiRootOptions;
	/** 시험이 풀을 닫아 "DB 중단" 을 재현할 수 있게 연다. */
	readonly dbPool: DbPoolComponent;
	readonly #http: HttpServerComponent;
	readonly #requests: RequestLogger;
	/** 시험이 라우트를 더해 오류 경로를 밟을 수 있게 연다. */
	readonly app: ReturnType<typeof createApiApp>;
	#ports: ApiPorts | undefined;

	constructor(options: ApiRootOptions) {
		const context = new LogContext();
		const log = new Logger({
			app: "api",
			level: options.config.LOG_LEVEL,
			clock: options.clock,
			sink: options.sink,
			redactor: new Redactor(),
			context,
		});
		super(log);
		this.#options = options;
		this.log = log;
		// 기동이 끝나 ReadinessComponent 가 풀기 전까지 readyz 는 503 이다.
		this.health = new HealthRegistry(pkg.version);
		this.health.setDraining(true);
		this.dbPool = new DbPoolComponent(options.config.DATABASE_URL.reveal());
		this.health.register({
			name: "db",
			critical: true,
			run: async () =>
				(await ping(this.dbPool.pool, READYZ_DB_TIMEOUT_MS)).ok
					? { status: "ok" }
					: // 풀이 닫혔거나 닿지 않는다 — 주소·사유는 싣지 않는다(F17 §5).
						{ status: "fail", detail: "unreachable" },
		});
		this.#requests = new RequestLogger({
			log,
			context,
			ids: options.ids,
			failureResponse: (traceId) =>
				errorResponse(500, "internal_error", "Internal Server Error", traceId),
		});
		this.app = createApiApp({
			health: this.health,
			requests: this.#requests,
			traceId: () => context.current().traceId ?? options.ids.next(),
		});
		this.#http = new HttpServerComponent({
			port: options.config.API_PORT,
			fetch: (request) => this.handle(request),
		});
	}

	/** 요청 한 건을 처리한다 — 소켓 없이도 부를 수 있어 시험 하니스가 쓴다. */
	handle(request: Request): Promise<Response> {
		return this.#requests.handle(request, (inner) => this.app.handle(inner));
	}

	/** 시작 뒤에 열린 포트(`API_PORT` 가 0 이면 운영체제가 고른 값). */
	get port(): number {
		return this.#http.port;
	}

	/** 모듈 단계에서 만든 포트 묶음 — 시작 전에는 없다. */
	get ports(): ApiPorts {
		if (this.#ports === undefined) {
			throw new Error("ApiRoot 가 아직 시작되지 않았다");
		}
		return this.#ports;
	}

	protected override build(): readonly Component[] {
		const { config, clock, ids, faults } = this.#options;
		return [
			new ConfigComponent(this.log, summarize(config)),
			this.dbPool,
			{
				name: "modules",
				phase: 30,
				start: async () => {
					this.#ports = createApiPorts({
						pool: this.dbPool.pool,
						clock,
						ids,
						faults,
					});
				},
				stop: async () => undefined,
			},
			this.#http,
			new ReadinessComponent(this.health),
		];
	}
}
