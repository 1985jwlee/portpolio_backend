// 요청 하나의 로그 판정(F17 §6.5)과 추적 id 결정(가정 G-5).
import type { IdGenerator } from "@pf/kernel";
import type { LogLevel } from "./logger.ts";

// 상태 확인 경로는 성공 응답을 남기지 않는다 — 오케스트레이터가 몇 초마다 부르므로 소음이다.
const QUIET_PATHS: ReadonlySet<string> = new Set([
	"/healthz",
	"/readyz",
	"/metrics",
]);

/** 요청 종료 로그의 수준. 남기지 않으면 undefined. 5xx 는 error, 4xx 는 warn, 그 밖은 info 이고 조용한 경로의 2xx·3xx 는 없다. */
export function requestLogLevel(
	status: number,
	path: string,
): LogLevel | undefined {
	if (status >= 500) {
		return "error";
	}
	if (status >= 400) {
		return "warn";
	}
	return QUIET_PATHS.has(path) ? undefined : "info";
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `X-Trace-Id` 가 uuid 모양이면 받아들이고(소문자로 통일), 아니면 새로 발급한다. 임의 문자열은 로그에 들어가지 않는다. */
export function resolveTraceId(
	header: string | null | undefined,
	ids: IdGenerator,
): string {
	const candidate = header?.trim();
	return candidate !== undefined && UUID_PATTERN.test(candidate)
		? candidate.toLowerCase()
		: ids.next();
}
