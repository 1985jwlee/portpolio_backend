// worker(L2) — healthz 라우트·명령 프레임·설정·기동 실패. DB 가 살아 있을 때의 healthz 200 은 integration/worker-health.test.ts(L3)다.
// 앱의 비조립 코드(시험 포함)는 모듈 구현을 임포트할 수 없어(B13) 헬스 단위 시험은 modules/observability/test 가 맡는다.
import { describe, expect, test } from "bun:test";
import {
	exitCodeFor,
	loadConfig,
	MapEnvSource,
	SecretString,
} from "@pf/config";
import { EXIT_CODES, exitCodeOf } from "@pf/infra";
import { createCommands, EXIT_USAGE, runCli } from "../src/cli/run-cli.ts";
import { WorkerRoot } from "../src/compose/root.ts";
import { workerSchema } from "../src/config.ts";

const TRACE = "00000000-0000-7000-8000-000000000001";
const URL_WITH_SECRET = "postgres://u:SENTINEL-PW@127.0.0.1:1/none";

function makeRoot() {
	return new WorkerRoot({
		config: {
			APP_ENV: "test",
			LOG_LEVEL: "debug",
			DATABASE_URL: new SecretString(URL_WITH_SECRET),
			WORKER_PORT: 0,
		},
		clock: { now: () => new Date("2026-11-26T00:00:00.000Z") },
		ids: { next: () => TRACE },
		sink: { write: () => undefined },
	});
}

const request = (path: string, method = "GET") =>
	new Request(`http://localhost${path}`, { method });

describe("worker 라우트", () => {
	test("DB 가 닿지 않으면 /healthz 는 503 이고 본문에 접속 주소·비밀이 없다", async () => {
		const response = await makeRoot().handle(request("/healthz"));
		expect(response.status).toBe(503);
		const text = JSON.stringify(await response.json());
		expect(text).toContain('"db"');
		expect(text).not.toContain("SENTINEL-PW");
		expect(text).not.toContain("postgres://");
	});

	test("그 밖의 경로·메서드는 공용 봉투의 404 이고 /readyz 는 없다", async () => {
		const root = makeRoot();
		for (const [path, method] of [
			["/readyz", "GET"],
			["/healthz", "POST"],
			["/", "GET"],
		] as const) {
			const response = await root.handle(request(path, method));
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				error: { code: "not_found", message: "Not Found", traceId: TRACE },
			});
		}
	});
});

describe("worker 명령 프레임", () => {
	function run(argv: string[]) {
		const out: string[] = [];
		const err: string[] = [];
		const code = runCli(
			argv,
			createCommands(),
			(line) => out.push(line),
			(line) => err.push(line),
		);
		return { code, out, err };
	}

	test("help 는 명령 목록을 내고 0 으로 끝난다", () => {
		const { code, out } = run(["help"]);
		expect(code).toBe(0);
		expect(out.join("\n")).toContain("help");
	});

	test("모르는 명령은 사용법 오류 2 이고 표준 출력은 비어 있다", () => {
		const { code, out, err } = run(["nope"]);
		expect(code).toBe(EXIT_USAGE);
		expect(EXIT_USAGE).toBe(2);
		expect(out).toEqual([]);
		expect(err.join("\n")).toContain("nope");
	});

	test("명령이 없어도 2 다", () => {
		expect(run([]).code).toBe(2);
	});
});

describe("worker 설정", () => {
	test("WORKER_PORT 기본값은 3003 이다", () => {
		const loaded = loadConfig(
			workerSchema,
			new MapEnvSource({ DATABASE_URL: "postgres://u:p@h:5432/db" }),
		);
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.value.config.WORKER_PORT).toBe(3003);
		}
	});

	test("DATABASE_URL 이 없으면 종료 코드 78 이다", () => {
		const loaded = loadConfig(workerSchema, new MapEnvSource({}));
		expect(loaded.ok).toBe(false);
		if (!loaded.ok) {
			expect(exitCodeFor(loaded.error)).toBe(78);
		}
	});
});

describe("WorkerRoot 기동 실패", () => {
	test("닿지 않는 DB 면 종료 코드 69 이고 포트를 열지 않는다", async () => {
		const root = makeRoot();
		const thrown = await root.start().catch((error: unknown) => error);
		expect(exitCodeOf(thrown)).toBe(EXIT_CODES.DB_UNAVAILABLE);
		expect(() => root.port).toThrow();
	});
});
