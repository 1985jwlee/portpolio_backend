// HTTP 요청 한 건을 감싸는 공통 골격 — trace_id 결정·로그 맥락 열기·응답 헤더·종료 로그 한 줄(F17 §6.4·§6.5, 가정 G-5).
// 라우팅·오류 본문은 앱의 몫이라 여기서는 모른다: 안쪽 처리기와 "처리 실패 응답 만들기" 만 받는다.
import type { IdGenerator } from "@pf/kernel";
import { errorFields } from "./error-fields.ts";
import type { LogContext } from "./log-context.ts";
import type { Logger } from "./logger.ts";
import { requestLogLevel, resolveTraceId } from "./request-log.ts";

export const TRACE_HEADER = "X-Trace-Id";

export type RequestLoggerOptions = {
	readonly log: Logger;
	readonly context: LogContext;
	readonly ids: IdGenerator;
	/** 안쪽 처리기가 던졌을 때 돌려줄 응답(5xx). traceId 를 본문에 싣는 것은 만드는 쪽의 몫이다. */
	readonly failureResponse: (traceId: string) => Response;
};

export class RequestLogger {
	readonly #options: RequestLoggerOptions;
	// 라우터가 처리하고 응답으로 바꾼 오류 — 종료 로그가 err.* 를 싣도록 요청 객체에 묶어 둔다.
	readonly #failures = new WeakMap<Request, unknown>();

	constructor(options: RequestLoggerOptions) {
		this.#options = options;
	}

	/** 라우터의 오류 처리기가 부른다 — 이 요청의 종료 로그에 오류 정보가 실린다. */
	recordFailure(request: Request, error: unknown): void {
		this.#failures.set(request, error);
	}

	async handle(
		request: Request,
		inner: (request: Request) => Response | Promise<Response>,
	): Promise<Response> {
		const { context, ids } = this.#options;
		const traceId = resolveTraceId(request.headers.get(TRACE_HEADER), ids);
		return context.run({ traceId, reqId: ids.next() }, async () => {
			const startedAt = performance.now();
			const response = await this.#call(request, traceId, inner);
			const traced = new Headers(response.headers);
			traced.set(TRACE_HEADER, traceId);
			const result = new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: traced,
			});
			this.#logEnd(request, result.status, performance.now() - startedAt);
			return result;
		});
	}

	async #call(
		request: Request,
		traceId: string,
		inner: (request: Request) => Response | Promise<Response>,
	): Promise<Response> {
		try {
			return await inner(request);
		} catch (error) {
			this.recordFailure(request, error);
			return this.#options.failureResponse(traceId);
		}
	}

	#logEnd(request: Request, status: number, durationMs: number): void {
		const path = new URL(request.url).pathname;
		const level = requestLogLevel(status, path);
		if (level === undefined) {
			return;
		}
		// 쿼리 문자열은 싣지 않는다 — 토큰 같은 값이 들어올 수 있다.
		const fields = {
			method: request.method,
			path,
			status,
			duration_ms: Math.round(durationMs),
			...(this.#failures.has(request)
				? errorFields(this.#failures.get(request))
				: {}),
		};
		this.#options.log[level]("request", fields);
	}
}
