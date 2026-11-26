// HealthRegistry·요청 로그 판정·추적 id(L2) — F17 §5·§6.5.
import { describe, expect, test } from "bun:test";
import {
	type HealthCheck,
	HealthRegistry,
	httpStatusOf,
	requestLogLevel,
	resolveTraceId,
} from "@pf/observability";

function check(
	name: string,
	critical: boolean,
	run: HealthCheck["run"],
): HealthCheck {
	return { name, critical, run };
}

const ok = async () => ({ status: "ok" as const });
const fail = async () => ({ status: "fail" as const, detail: "down" });

describe("HealthRegistry.readiness", () => {
	test("등록된 검사가 없으면 ok 이고 버전을 싣는다", async () => {
		const report = await new HealthRegistry("1.2.3").readiness();
		expect(report).toEqual({ status: "ok", version: "1.2.3", checks: {} });
		expect(httpStatusOf(report)).toBe(200);
	});

	test("치명 검사가 실패하면 fail 이고 503 이다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(check("db", true, fail));
		const report = await registry.readiness();
		expect(report.status).toBe("fail");
		expect(report.checks.db).toEqual({ status: "fail", detail: "down" });
		expect(httpStatusOf(report)).toBe(503);
	});

	test("비치명 검사 실패는 degraded 이고 200 이다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(check("db", true, ok));
		registry.register(check("lag", false, fail));
		const report = await registry.readiness();
		expect(report.status).toBe("degraded");
		expect(httpStatusOf(report)).toBe(200);
	});

	test("치명 실패는 비치명 실패가 먼저 와도 fail 이다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(check("lag", false, fail));
		registry.register(check("db", true, fail));
		expect((await registry.readiness()).status).toBe("fail");
	});

	test("draining 이면 검사가 모두 ok 여도 503 이고, 해제하면 돌아온다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(check("db", true, ok));
		registry.setDraining(true);
		const draining = await registry.readiness();
		expect(httpStatusOf(draining)).toBe(503);
		expect(draining.checks.draining?.status).toBe("fail");
		registry.setDraining(false);
		expect(httpStatusOf(await registry.readiness())).toBe(200);
	});

	test("검사가 던지면 fail 로 보고하고 예외 메시지(비밀 후보)를 싣지 않는다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(
			check("db", true, async () => {
				throw new Error("postgres://u:SENTINEL-PW@host/db refused");
			}),
		);
		const report = await registry.readiness();
		expect(report.status).toBe("fail");
		expect(JSON.stringify(report)).not.toContain("SENTINEL-PW");
	});
});

describe("HealthRegistry.liveness", () => {
	test("draining 은 liveness 에 영향이 없다 — 종료 직전까지 200 이다", async () => {
		const registry = new HealthRegistry("v");
		registry.setDraining(true);
		expect(httpStatusOf(await registry.liveness())).toBe(200);
	});

	test("readiness 검사는 liveness 에 섞이지 않고 liveness 검사는 따로 등록한다", async () => {
		const registry = new HealthRegistry("v");
		registry.register(check("db", true, fail));
		expect(httpStatusOf(await registry.liveness())).toBe(200);
		registry.registerLiveness(check("db", true, fail));
		expect(httpStatusOf(await registry.liveness())).toBe(503);
	});
});

describe("requestLogLevel", () => {
	test.each([
		[200, "/api/entries", "info"],
		[304, "/api/entries", "info"],
		[404, "/api/entries", "warn"],
		[429, "/healthz", "warn"],
		[500, "/api/entries", "error"],
		[503, "/readyz", "error"],
	] as const)("%i %s → %s", (status, path, expected) => {
		expect(requestLogLevel(status, path)).toBe(expected);
	});

	test.each(["/healthz", "/readyz", "/metrics"])(
		"%s 의 2xx·3xx 는 남기지 않는다",
		(path) => {
			expect(requestLogLevel(200, path)).toBeUndefined();
			expect(requestLogLevel(302, path)).toBeUndefined();
		},
	);
});

describe("resolveTraceId", () => {
	const ids = { next: () => "generated-id" };

	test("uuid 모양이면 받아들이고 소문자로 통일한다", () => {
		expect(resolveTraceId("0192F3A4-7B1C-7DEF-8123-456789ABCDEF", ids)).toBe(
			"0192f3a4-7b1c-7def-8123-456789abcdef",
		);
	});

	test.each([null, undefined, "", "not-a-uuid", "203.0.113.5", "../../etc"])(
		"%p 는 버리고 새로 발급한다",
		(header) => {
			expect(resolveTraceId(header, ids)).toBe("generated-id");
		},
	);
});
