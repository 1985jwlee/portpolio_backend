// 구조화 JSON 로거(F17 §6) — 맥락 병합 → 마스킹 → 직렬화 → sink. 외부 로거 라이브러리를 쓰지 않는다(가정 G-3).
import type { Clock } from "@pf/kernel";
import type { LogContext } from "./log-context.ts";
import type { LogSink } from "./log-sink.ts";
import type { Redactor } from "./redactor.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, unknown>>;

const SEVERITY: Readonly<Record<LogLevel, number>> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

export type LoggerOptions = {
	readonly app: string;
	readonly level: LogLevel;
	readonly clock: Clock;
	readonly sink: LogSink;
	readonly redactor: Redactor;
	readonly context: LogContext;
};

// 줄의 필수 필드 — 호출자가 같은 이름의 필드로 덮어쓰지 못하게 먼저 채운다.
const RESERVED = new Set(["ts", "level", "msg", "app"]);

export class Logger {
	readonly #options: LoggerOptions;
	readonly #bound: LogFields;

	constructor(options: LoggerOptions, bound: LogFields = {}) {
		this.#options = options;
		this.#bound = bound;
	}

	debug(msg: string, fields?: LogFields): void {
		this.#emit("debug", msg, fields);
	}

	info(msg: string, fields?: LogFields): void {
		this.#emit("info", msg, fields);
	}

	warn(msg: string, fields?: LogFields): void {
		this.#emit("warn", msg, fields);
	}

	error(msg: string, fields?: LogFields): void {
		this.#emit("error", msg, fields);
	}

	/** 고정 필드(예: module)를 이 로거의 모든 줄에 싣는 하위 로거. */
	child(fields: LogFields): Logger {
		return new Logger(this.#options, { ...this.#bound, ...fields });
	}

	#emit(level: LogLevel, msg: string, fields: LogFields | undefined): void {
		const { app, clock, sink, redactor, context } = this.#options;
		if (SEVERITY[level] < SEVERITY[this.#options.level]) {
			return;
		}
		const ctx = context.current();
		// 맥락 → 고정 필드 → 호출 필드 순으로 덮는다. 거부목록·패턴 마스킹은 전부를 한꺼번에 통과시킨다.
		const extra = redactor.redact({
			...(ctx.module === undefined ? {} : { module: ctx.module }),
			...(ctx.usecase === undefined ? {} : { usecase: ctx.usecase }),
			...(ctx.traceId === undefined ? {} : { trace_id: ctx.traceId }),
			...(ctx.reqId === undefined ? {} : { req_id: ctx.reqId }),
			...this.#bound,
			...fields,
		}) as Record<string, unknown>;
		const line: Record<string, unknown> = {
			ts: clock.now().toISOString(),
			level,
			msg: redactor.redact(msg),
			app,
		};
		for (const [key, value] of Object.entries(extra)) {
			if (!RESERVED.has(key)) {
				line[key] = value;
			}
		}
		try {
			sink.write(JSON.stringify(line));
		} catch (error) {
			// 로그 기록 실패가 호출자를 깨뜨리면 안 된다 — 남길 곳이 없으니 표준 오류에 한 줄만 낸다.
			process.stderr.write(
				`logger: sink 쓰기 실패 ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	}
}
