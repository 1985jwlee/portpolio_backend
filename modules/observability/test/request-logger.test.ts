// RequestLogger(L2) — trace_id·req_id·응답 헤더·종료 로그 한 줄·수준 판정이 요청 한 건 안에서 이어지는지.
import { describe, expect, test } from "bun:test";
import { ValidationError } from "@pf/kernel";
import {
	LogContext,
	Logger,
	type LogSink,
	Redactor,
	RequestLogger,
	TRACE_HEADER,
} from "@pf/observability";

const lines: Record<string, unknown>[] = [];
const sink: LogSink = {
	write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
};

function setup() {
	lines.length = 0;
	let counter = 0;
	const ids = {
		next: () =>
			`00000000-0000-7000-8000-${String(++counter).padStart(12, "0")}`,
	};
	const context = new LogContext();
	const log = new Logger({
		app: "api",
		level: "debug",
		clock: { now: () => new Date("2026-11-26T00:00:00.000Z") },
		sink,
		redactor: new Redactor(),
		context,
	});
	const requests = new RequestLogger({
		log,
		context,
		ids,
		failureResponse: (traceId) =>
			new Response(JSON.stringify({ traceId }), { status: 500 }),
	});
	return { requests, log, context };
}

const request = (path: string, headers: Record<string, string> = {}) =>
	new Request(`http://localhost${path}`, { headers });

describe("trace_id", () => {
	test("uuid 형식의 X-Trace-Id 는 받아들여 응답 헤더에 되돌린다", async () => {
		const { requests } = setup();
		const traceId = "0192f3a4-7b1c-7def-8123-456789abcdef";
		const response = await requests.handle(
			request("/x", { [TRACE_HEADER]: traceId }),
			() => new Response("ok"),
		);
		expect(response.headers.get(TRACE_HEADER)).toBe(traceId);
		expect(lines[0]?.trace_id).toBe(traceId);
	});

	test("형식이 틀린 값은 버리고 발급한 값을 헤더와 로그에 같이 쓴다", async () => {
		const { requests } = setup();
		const response = await requests.handle(
			request("/x", { [TRACE_HEADER]: "203.0.113.5" }),
			() => new Response("ok"),
		);
		const header = response.headers.get(TRACE_HEADER);
		expect(header).toMatch(/^00000000-0000-7000-8000-/);
		expect(lines[0]?.trace_id).toBe(header);
		expect(JSON.stringify(lines)).not.toContain("203.0.113.5");
	});

	test("처리기 안의 로그 줄이 같은 trace_id 를 공유한다(await 경계 뒤에도)", async () => {
		const { requests, log } = setup();
		await requests.handle(request("/x"), async () => {
			log.info("inside-1");
			await new Promise((resolve) => setTimeout(resolve, 5));
			log.info("inside-2");
			return new Response("ok");
		});
		const traceIds = lines.map((line) => line.trace_id);
		expect(new Set(traceIds).size).toBe(1);
		expect(lines.map((line) => line.msg)).toEqual([
			"inside-1",
			"inside-2",
			"request",
		]);
	});

	test("요청마다 req_id 가 다르다", async () => {
		const { requests } = setup();
		await requests.handle(request("/a"), () => new Response("ok"));
		await requests.handle(request("/b"), () => new Response("ok"));
		expect(lines[0]?.req_id).not.toBe(lines[1]?.req_id);
	});
});

describe("종료 로그", () => {
	test("2xx 는 info 한 줄이고 쿼리 문자열은 싣지 않는다", async () => {
		const { requests } = setup();
		await requests.handle(
			request("/entries?token=SENTINEL-QUERY"),
			() => new Response("ok"),
		);
		expect(lines.length).toBe(1);
		expect(lines[0]).toMatchObject({
			level: "info",
			msg: "request",
			method: "GET",
			path: "/entries",
			status: 200,
		});
		expect(typeof lines[0]?.duration_ms).toBe("number");
		expect(JSON.stringify(lines)).not.toContain("SENTINEL-QUERY");
	});

	test.each(["/healthz", "/readyz", "/metrics"])(
		"%s 의 200 은 한 줄도 남기지 않는다",
		async (path) => {
			const { requests } = setup();
			await requests.handle(request(path), () => new Response("ok"));
			expect(lines).toEqual([]);
		},
	);

	test("4xx 는 warn, 5xx 는 error 이고 조용한 경로의 5xx 도 남긴다", async () => {
		const { requests } = setup();
		await requests.handle(
			request("/x"),
			() => new Response("no", { status: 404 }),
		);
		await requests.handle(
			request("/readyz"),
			() => new Response("down", { status: 503 }),
		);
		expect(lines.map((line) => line.level)).toEqual(["warn", "error"]);
	});

	test("처리기가 던지면 failureResponse 의 500 이 나가고 unexpected 스택이 실린다", async () => {
		const { requests } = setup();
		const response = await requests.handle(request("/x"), () => {
			throw new Error("boom");
		});
		expect(response.status).toBe(500);
		const body = (await response.json()) as { traceId: string };
		expect(response.headers.get(TRACE_HEADER)).toBe(body.traceId);
		expect(lines[0]).toMatchObject({
			level: "error",
			"err.kind": "unexpected",
		});
		expect(lines[0]).toHaveProperty(["err.stack"]);
	});

	test("라우터가 recordFailure 한 도메인 오류는 stack 없이 err.code·err.kind 로 실린다", async () => {
		const { requests } = setup();
		const failure = new ValidationError({
			message: "v",
			code: "validation_failed",
		});
		await requests.handle(request("/x"), (req) => {
			requests.recordFailure(req, failure);
			return new Response("bad", { status: 500 });
		});
		expect(lines[0]).toMatchObject({
			"err.kind": "domain",
			"err.code": "validation_failed",
		});
		expect(lines[0]).not.toHaveProperty(["err.stack"]);
	});
});
