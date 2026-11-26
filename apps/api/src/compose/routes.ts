// api 의 라우트 등록(조립 — B13: 앱의 비조립 코드는 모듈 구현을 임포트하지 않는다). 지금은 헬스 둘뿐이다.
import type { HealthRegistry, RequestLogger } from "@pf/observability";
import { type HealthReport, httpStatusOf } from "@pf/observability";
import type { ErrorBody } from "@pf/protocol";
import { Elysia } from "elysia";

export type ApiAppDeps = {
	readonly health: HealthRegistry;
	readonly requests: RequestLogger;
	/** 지금 요청의 trace_id — 오류 본문에 싣는다. */
	readonly traceId: () => string;
};

/** 공용 오류 봉투(@pf/protocol ErrorBody)로 만든 응답. */
export function errorResponse(
	status: number,
	code: string,
	message: string,
	traceId: string,
): Response {
	const body: ErrorBody = { error: { code, message, traceId } };
	return Response.json(body, { status });
}

function reportResponse(report: HealthReport): Response {
	return Response.json(report, { status: httpStatusOf(report) });
}

/** 네트워크를 열지 않는 Elysia 앱 — `handle(request)` 로 부른다. 서버·시험이 같은 앱을 쓴다. */
export function createApiApp(deps: ApiAppDeps) {
	const { health, requests, traceId } = deps;
	return new Elysia()
		.onError(({ code, error, request }) => {
			if (code === "NOT_FOUND") {
				return errorResponse(404, "not_found", "Not Found", traceId());
			}
			// 라우터가 삼킨 처리되지 않은 오류 — 종료 로그가 err.* 를 싣도록 알리고 본문에는 내용을 싣지 않는다.
			requests.recordFailure(request, error);
			return errorResponse(
				500,
				"internal_error",
				"Internal Server Error",
				traceId(),
			);
		})
		.get("/healthz", async () => reportResponse(await health.liveness()))
		.get("/readyz", async () => reportResponse(await health.readiness()));
}
