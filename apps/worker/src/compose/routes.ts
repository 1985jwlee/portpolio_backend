// worker 의 HTTP 표면 — `/healthz` 하나뿐이다(라우팅 대상이 아니라 readyz 는 없다, F17 §5.1). 프레임워크 없이 경로만 가른다.
import type { HealthRegistry } from "@pf/observability";
import { httpStatusOf } from "@pf/observability";
import type { ErrorBody } from "@pf/protocol";

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

export function createWorkerRoutes(deps: {
	readonly health: HealthRegistry;
	readonly traceId: () => string;
}): (request: Request) => Promise<Response> {
	const { health, traceId } = deps;
	return async (request) => {
		const { pathname } = new URL(request.url);
		if (request.method === "GET" && pathname === "/healthz") {
			const report = await health.liveness();
			return Response.json(report, { status: httpStatusOf(report) });
		}
		return errorResponse(404, "not_found", "Not Found", traceId());
	};
}
