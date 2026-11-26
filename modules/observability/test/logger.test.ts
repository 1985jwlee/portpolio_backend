// Logger(L2) — 줄 모양·필수 필드·수준·맥락 병합·child·마스킹이 출력까지 이어지는지(F17 §6.1·§6.4).
import { describe, expect, test } from "bun:test";
import {
	ConfigError,
	ConflictError,
	DomainError,
	InfraError,
	NotFoundError,
	PermanentError,
	RateLimitedError,
	TransientError,
	ValidationError,
} from "@pf/kernel";
import {
	errorFields,
	errorKindOf,
	LogContext,
	Logger,
	type LogLevel,
	type LogSink,
	REDACTED,
	Redactor,
} from "@pf/observability";

class MemorySink implements LogSink {
	readonly lines: string[] = [];
	write(line: string): void {
		this.lines.push(line);
	}
	parsed(): Record<string, unknown>[] {
		return this.lines.map(
			(line) => JSON.parse(line) as Record<string, unknown>,
		);
	}
}

const NOW = new Date("2026-11-26T01:02:03.456Z");

function setup(level: LogLevel = "debug") {
	const sink = new MemorySink();
	const context = new LogContext();
	const redactor = new Redactor();
	const logger = new Logger({
		app: "api",
		level,
		clock: { now: () => NOW },
		sink,
		redactor,
		context,
	});
	return { sink, context, redactor, logger };
}

describe("줄 모양", () => {
	test("필수 필드 ts·level·msg·app 이 앞에 오고 ts 는 ISO8601 UTC 밀리초다", () => {
		const { sink, logger } = setup();
		logger.info("entry posted", { event_id: "e1" });
		const [line] = sink.parsed();
		expect(Object.keys(line ?? {}).slice(0, 4)).toEqual([
			"ts",
			"level",
			"msg",
			"app",
		]);
		expect(line).toEqual({
			ts: "2026-11-26T01:02:03.456Z",
			level: "info",
			msg: "entry posted",
			app: "api",
			event_id: "e1",
		});
	});

	test("호출 필드가 필수 필드를 덮어쓰지 못한다", () => {
		const { sink, logger } = setup();
		logger.info("real", { msg: "fake", level: "debug", app: "x", ts: "t" });
		expect(sink.parsed()[0]).toMatchObject({
			msg: "real",
			level: "info",
			app: "api",
			ts: "2026-11-26T01:02:03.456Z",
		});
	});

	test("한 줄은 개행이 없는 JSON 이다", () => {
		const { sink, logger } = setup();
		logger.info("multi\nline", { note: "a\nb" });
		expect(sink.lines[0]).not.toContain("\n");
	});
});

describe("수준", () => {
	test.each([
		["debug", 4],
		["info", 3],
		["warn", 2],
		["error", 1],
	] as const)("설정 %s 이면 %i 줄이 나온다", (level, expected) => {
		const { sink, logger } = setup(level);
		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		logger.error("e");
		expect(sink.lines.length).toBe(expected);
	});
});

describe("맥락·child", () => {
	test("LogContext 의 값이 trace_id·req_id·module·usecase 로 실린다", () => {
		const { sink, context, logger } = setup();
		context.run(
			{
				traceId: "t-1",
				reqId: "r-1",
				module: "guestbook",
				usecase: "PostEntry",
			},
			() => logger.info("ok"),
		);
		expect(sink.parsed()[0]).toMatchObject({
			trace_id: "t-1",
			req_id: "r-1",
			module: "guestbook",
			usecase: "PostEntry",
		});
	});

	test("맥락 밖의 줄에는 trace_id 가 없다", () => {
		const { sink, logger } = setup();
		logger.info("no ctx");
		expect(sink.parsed()[0]).not.toHaveProperty("trace_id");
	});

	test("child 의 고정 필드가 모든 줄에 실리고 부모는 영향받지 않는다", () => {
		const { sink, logger } = setup();
		const child = logger.child({ module: "events" });
		child.info("a");
		logger.info("b");
		const [a, b] = sink.parsed();
		expect(a).toMatchObject({ module: "events" });
		expect(b).not.toHaveProperty("module");
	});

	test("한 흐름의 줄들이 같은 trace_id 를 공유한다(await 경계를 넘어)", async () => {
		const { sink, context, logger } = setup();
		await context.run({ traceId: "t-9" }, async () => {
			logger.info("first");
			await new Promise((resolve) => setTimeout(resolve, 5));
			logger.info("second");
		});
		expect(sink.parsed().map((line) => line.trace_id)).toEqual(["t-9", "t-9"]);
	});
});

describe("마스킹이 출력까지 이어진다", () => {
	test("센티널 IP·본문·토큰은 출력에 없다", () => {
		const { sink, redactor, logger } = setup();
		logger.info("login", {
			body: "SENTINEL-BODY-TEXT",
			displayName: "SENTINEL-NAME",
			headers: { authorization: "Bearer SENTINEL-TOKEN-VALUE" },
			note: "from 203.0.113.77",
			url: "postgres://u:SENTINEL-PW@h/db",
		});
		const out = sink.lines[0] ?? "";
		for (const secret of [
			"SENTINEL-BODY-TEXT",
			"SENTINEL-NAME",
			"SENTINEL-TOKEN-VALUE",
			"203.0.113.77",
			"SENTINEL-PW",
		]) {
			expect(out).not.toContain(secret);
		}
		expect(out).toContain(REDACTED);
		expect(redactor.redactionCount()).toBeGreaterThan(0);
	});

	test("맥락 값(trace_id)도 마스킹을 지난다", () => {
		const { sink, context, logger } = setup();
		context.run({ traceId: "203.0.113.5" }, () => logger.info("x"));
		expect(sink.lines[0]).not.toContain("203.0.113.5");
	});
});

describe("sink 실패", () => {
	test("sink 가 던져도 호출자는 깨지지 않는다", () => {
		const logger = new Logger({
			app: "api",
			level: "info",
			clock: { now: () => NOW },
			sink: {
				write() {
					throw new Error("disk full");
				},
			},
			redactor: new Redactor(),
			context: new LogContext(),
		});
		expect(() => logger.info("x")).not.toThrow();
	});
});

describe("오류 필드(TD-7 7-5)", () => {
	class SampleDomain extends DomainError {
		override get kind() {
			return "ValidationError" as const;
		}
	}
	class SampleInfra extends InfraError {
		override get kind() {
			return "PermanentError" as const;
		}
	}

	test("DomainError → domain, InfraError → infra, 그 밖 → unexpected", () => {
		expect(errorKindOf(new SampleDomain({ message: "d" }))).toBe("domain");
		expect(errorKindOf(new SampleInfra({ message: "i" }))).toBe("infra");
		expect(errorKindOf(new Error("boom"))).toBe("unexpected");
		expect(errorKindOf("문자열")).toBe("unexpected");
	});

	test("err.kind 는 AppError.kind(클래스 이름)가 아니라 계층으로 가른다 — kernel 의 실제 클래스 전수", () => {
		const domain = [
			ValidationError,
			ConflictError,
			NotFoundError,
			RateLimitedError,
		];
		const infra = [TransientError, PermanentError, ConfigError];
		for (const Class of domain) {
			const error = new Class({ message: "x" });
			expect(String(error.kind)).toBe(Class.name);
			expect(errorFields(error)["err.kind"]).toBe("domain");
		}
		for (const Class of infra) {
			const error = new Class({ message: "x" });
			expect(String(error.kind)).toBe(Class.name);
			expect(errorFields(error)["err.kind"]).toBe("infra");
		}
	});

	test("err.code 는 AppError.code 이고 AppError 가 아니면 없다", () => {
		const domain = new SampleDomain({ message: "d", code: "my_code" });
		expect(errorFields(domain)["err.code"]).toBe(domain.code);
		expect(errorFields(new Error("x"))).not.toHaveProperty(["err.code"]);
	});

	test("err.stack 은 unexpected 에서만 있고 길이가 제한된다", () => {
		const unexpected = new Error("boom");
		unexpected.stack = `Error: boom\n${"at x\n".repeat(2_000)}`;
		const fields = errorFields(unexpected);
		expect(String(fields["err.stack"]).length).toBeLessThanOrEqual(2_000);
		expect(errorFields(new SampleDomain({ message: "d" }))).not.toHaveProperty([
			"err.stack",
		]);
		expect(errorFields(new SampleInfra({ message: "i" }))).not.toHaveProperty([
			"err.stack",
		]);
	});
});
