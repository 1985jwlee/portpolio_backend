// api 라우트·설정·기동 실패(L2) — DB 없이 ApiRoot 의 요청 처리(handle)와 닿지 않는 주소의 기동 실패를 잰다.
// 앱의 비조립 코드(시험 포함)는 모듈 구현을 임포트할 수 없어(B13) 헬스·로거 단위 시험은 modules/observability/test 에 있고,
// 여기서는 조립이 그것들을 올바르게 꽂았는지만 본다. DB 가 살아 있을 때의 readyz 200 은 integration/api-harness.test.ts(L3)다.
import { describe, expect, test } from "bun:test";
import {
	exitCodeFor,
	loadConfig,
	MapEnvSource,
	SecretString,
} from "@pf/config";
import { EXIT_CODES, exitCodeOf } from "@pf/infra";
import { ConfigError } from "@pf/kernel";
import { ApiRoot } from "../src/compose/root.ts";
import { apiSchema } from "../src/config.ts";

const URL_WITH_SECRET = "postgres://u:SENTINEL-PW@127.0.0.1:1/none";

function makeRoot() {
	const lines: Record<string, unknown>[] = [];
	let counter = 0;
	const root = new ApiRoot({
		config: {
			APP_ENV: "test",
			LOG_LEVEL: "debug",
			DATABASE_URL: new SecretString(URL_WITH_SECRET),
			API_PORT: 0,
			DRAIN_DELAY_MS: 0,
		},
		clock: { now: () => new Date("2026-11-26T00:00:00.000Z") },
		ids: {
			next: () =>
				`00000000-0000-7000-8000-${String(++counter).padStart(12, "0")}`,
		},
		faults: { hit: async () => undefined },
		sink: { write: (line) => lines.push(JSON.parse(line)) },
	});
	const handle = (path: string, init?: RequestInit) =>
		root.handle(new Request(`http://localhost${path}`, init));
	return { root, lines, handle };
}

describe("healthz · readyz", () => {
	test("healthz 는 DB 와 무관하게 200 이고 버전을 싣는다", async () => {
		const { handle } = makeRoot();
		const response = await handle("/healthz");
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "ok",
			version: expect.stringMatching(/^\d+\.\d+\.\d+/),
		});
	});

	test("기동 전 readyz 는 503 이다 — draining 으로 시작하고 DB 검사도 실패한다", async () => {
		const { handle } = makeRoot();
		const response = await handle("/readyz");
		expect(response.status).toBe(503);
		const body = (await response.json()) as {
			status: string;
			checks: Record<string, { status: string }>;
		};
		expect(body.status).toBe("fail");
		expect(body.checks.draining?.status).toBe("fail");
		expect(body.checks.db?.status).toBe("fail");
		// 본문에 접속 주소·비밀이 실리지 않는다(F17 §5).
		const text = JSON.stringify(body);
		expect(text).not.toContain("SENTINEL-PW");
		expect(text).not.toContain("postgres://");
	});

	test("draining 을 풀어도 DB 가 닿지 않으면 readyz 는 503 이고 healthz 는 200 이다", async () => {
		const { root, handle } = makeRoot();
		root.health.setDraining(false);
		expect((await handle("/readyz")).status).toBe(503);
		expect((await handle("/healthz")).status).toBe(200);
	});

	test("healthz 의 200 은 로그를 남기지 않고 readyz 의 503 은 error 로 남긴다", async () => {
		const { handle, lines } = makeRoot();
		await handle("/healthz");
		expect(lines).toEqual([]);
		await handle("/readyz");
		expect(lines.map((line) => line.level)).toEqual(["error"]);
		expect(lines[0]).toMatchObject({ path: "/readyz", status: 503 });
		expect(JSON.stringify(lines)).not.toContain("SENTINEL-PW");
	});
});

describe("오류 응답", () => {
	test("없는 경로는 공용 봉투의 404 이고 X-Trace-Id 와 본문 traceId 가 같다", async () => {
		const { handle, lines } = makeRoot();
		const response = await handle("/nope");
		expect(response.status).toBe(404);
		const body = (await response.json()) as {
			error: { code: string; message: string; traceId: string };
		};
		expect(body.error).toMatchObject({
			code: "not_found",
			message: "Not Found",
		});
		expect(response.headers.get("X-Trace-Id")).toBe(body.error.traceId);
		expect(lines[0]).toMatchObject({ level: "warn", status: 404 });
	});

	test("들어온 X-Trace-Id 가 uuid 이면 응답·로그가 그 값을 쓴다", async () => {
		const { handle, lines } = makeRoot();
		const traceId = "0192f3a4-7b1c-7def-8123-456789abcdef";
		const response = await handle("/nope", {
			headers: { "X-Trace-Id": traceId },
		});
		expect(response.headers.get("X-Trace-Id")).toBe(traceId);
		expect(lines[0]?.trace_id).toBe(traceId);
	});

	test("라우트가 던지면 내용 없는 500 이고 로그에는 unexpected 스택이 실린다", async () => {
		const { root, handle, lines } = makeRoot();
		// Elysia 의 메서드는 같은 인스턴스에 라우트를 더한다 — root.handle 이 이 라우트를 본다.
		root.app.get("/boom", () => {
			throw new Error("SENTINEL-INTERNAL-DETAIL");
		});
		const response = await handle("/boom");
		expect(response.status).toBe(500);
		const text = JSON.stringify(await response.json());
		expect(text).not.toContain("SENTINEL-INTERNAL-DETAIL");
		expect(text).toContain("internal_error");
		expect(lines[0]).toMatchObject({
			level: "error",
			status: 500,
			"err.kind": "unexpected",
		});
		expect(lines[0]).toHaveProperty(["err.stack"]);
	});
});

describe("설정", () => {
	const env = (values: Record<string, string>) => new MapEnvSource(values);

	test("API_PORT 기본값은 3001 이고 DATABASE_URL 은 비밀 문자열이다", () => {
		const loaded = loadConfig(
			apiSchema,
			env({ DATABASE_URL: "postgres://u:p@h:5432/db" }),
		);
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.value.config.API_PORT).toBe(3001);
			expect(loaded.value.config.DATABASE_URL).toBeInstanceOf(SecretString);
			expect(JSON.stringify(loaded.value.config)).not.toContain("u:p@h");
		}
	});

	test("DATABASE_URL 이 없으면 이름만 담은 ConfigError 이고 종료 코드는 78 이다", () => {
		const loaded = loadConfig(apiSchema, env({}));
		expect(loaded.ok).toBe(false);
		if (!loaded.ok) {
			expect(loaded.error).toBeInstanceOf(ConfigError);
			expect(loaded.error.details).toMatchObject({ missing: ["DATABASE_URL"] });
			expect(exitCodeFor(loaded.error)).toBe(EXIT_CODES.CONFIG);
		}
	});
});

describe("ApiRoot 기동 실패", () => {
	test("닿지 않는 DB 면 종료 코드 69 로 기동이 멈추고 포트를 열지 않는다", async () => {
		const { root, lines } = makeRoot();
		const thrown = await root.start().catch((error: unknown) => error);
		expect(exitCodeOf(thrown)).toBe(EXIT_CODES.DB_UNAVAILABLE);
		// phase 순서: config 요약이 먼저 나가고 dbPool 이 실패했으며 http 는 시작조차 하지 않았다.
		const messages = lines.map((line) => line.msg);
		expect(messages.slice(0, 2)).toEqual(["component start", "config loaded"]);
		expect(messages).toContain("component start failed");
		expect(() => root.port).toThrow();
		// 기동에 실패한 앱의 readyz 는 계속 503 이다.
		expect((await root.health.readiness()).status).toBe("fail");
		// 설정 요약 로그에 비밀 값이 실리지 않고 이름만 있다.
		const config = lines.find((line) => line.msg === "config loaded");
		expect(JSON.stringify(config)).not.toContain("SENTINEL-PW");
		expect(JSON.stringify(config)).toContain("DATABASE_URL");
	});
});
