import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	checkTrace,
	loadInput,
	type TraceInput,
	type TraceViolation,
} from "./check-trace.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url)).replace(
	/[\\/]$/,
	"",
);

// 시험 호출 표기를 리터럴로 적지 않는다 — 이 파일 자신이 규칙 4 의 스캔 대상이라
// `AC-` 로 시작하는 이름이 호출처럼 보이게 적히면 실저장소 검사가 이 파일을 위반으로 본다.
function call(kind: string, name: string): string {
	return `${kind}(${JSON.stringify(name)}, () => {});`;
}

const HEADER =
	"| AC | 제목 | 구현 작업 | 시험 | 코드 | 상태 |\n|---|---|---|---|---|---|\n";
const SPEC = "### AC-001: 하나\n\n### AC-002: 둘\n";

function row(ac: string, test: string, status: string): string {
	return `| ${ac} | 제목 | S1-1 | ${test} | — | ${status} |\n`;
}

function input(over: Partial<TraceInput> & { rows: string }): TraceInput {
	const { rows, ...rest } = over;
	return {
		traceText: HEADER + rows,
		specText: SPEC,
		testSources: new Map(),
		readSource: () => undefined,
		...rest,
	};
}

function rules(violations: TraceViolation[]): string[] {
	return violations.map((v) => `${v.rule} ${v.where}`).sort();
}

describe("규칙 1 — AC 집합 일치", () => {
	test("추적표와 명세가 같으면 통과한다", () => {
		const rows = row("AC-001", "—", "미구현") + row("AC-002", "—", "미구현");
		expect(checkTrace(input({ rows }))).toEqual([]);
	});

	test("명세에 없는 AC 가 추적표에 있으면 실패한다", () => {
		const rows =
			row("AC-001", "—", "미구현") +
			row("AC-002", "—", "미구현") +
			row("AC-009", "—", "미구현");
		expect(rules(checkTrace(input({ rows })))).toEqual([
			"TRACE-ac-not-in-spec AC-009",
		]);
	});

	test("추적표에 없는 명세 AC 가 있으면 실패한다", () => {
		expect(
			rules(checkTrace(input({ rows: row("AC-001", "—", "미구현") }))),
		).toEqual(["TRACE-ac-not-in-trace AC-002"]);
	});

	test("열 수가 맞지 않는 행은 형식 위반이다", () => {
		const rows = `${row("AC-001", "—", "미구현")}| AC-002 | 제목 | 둘뿐 |\n`;
		expect(rules(checkTrace(input({ rows })))).toContain(
			"TRACE-row-format AC-002",
		);
	});
});

describe("규칙 2·3 — 시험 칸", () => {
	const rows2 = row("AC-002", "—", "미구현");

	test("검증 행인데 시험 칸이 비었으면 실패한다", () => {
		const rows = row("AC-001", "—", "검증") + rows2;
		expect(rules(checkTrace(input({ rows })))).toEqual([
			"TRACE-verified-without-test AC-001",
		]);
	});

	test("시험 파일이 있고 소스에 이름이 있으면 통과한다 (이름의 백틱은 벗긴다)", () => {
		const rows = row("AC-001", "`a/x.test.ts` — `AC-001 이름`", "검증") + rows2;
		const readSource = (p: string) =>
			p === "a/x.test.ts" ? call("test", "AC-001 이름") : undefined;
		expect(checkTrace(input({ rows, readSource }))).toEqual([]);
	});

	test("`<br>` 로 나눈 여러 항목을 각각 본다", () => {
		const rows =
			row("AC-001", "`a.test.ts` — 있다<br>`b.test.ts` — 없다", "구현") + rows2;
		const readSource = (p: string) =>
			p === "a.test.ts" ? "있다" : p === "b.test.ts" ? "다른 이름" : undefined;
		expect(rules(checkTrace(input({ rows, readSource })))).toEqual([
			"TRACE-test-name-missing AC-001",
		]);
	});

	test("시험 파일이 없으면 실패한다", () => {
		const rows = row("AC-001", "`없음.test.ts` — 이름", "검증") + rows2;
		expect(rules(checkTrace(input({ rows })))).toEqual([
			"TRACE-test-file-missing AC-001",
		]);
	});

	test("파일은 있는데 소스에 이름이 없으면 실패한다", () => {
		const rows = row("AC-001", "`a.test.ts` — 사라진 이름", "검증") + rows2;
		const readSource = () => "다른 내용";
		expect(rules(checkTrace(input({ rows, readSource })))).toEqual([
			"TRACE-test-name-missing AC-001",
		]);
	});

	test("`경로` — 이름 형식이 아닌 시험 칸은 실패한다", () => {
		const rows = row("AC-001", "경로 없이 이름만", "구현") + rows2;
		expect(rules(checkTrace(input({ rows })))).toEqual([
			"TRACE-test-cell-format AC-001",
		]);
	});
});

describe("규칙 4 — 시험 이름이 가리키는 AC", () => {
	const rows = row("AC-001", "—", "미구현") + row("AC-002", "—", "미구현");

	test("명세에 있는 AC 로 시작하는 시험 이름은 통과한다", () => {
		const testSources = new Map([
			[
				"a/test/x.test.ts",
				call("test", "AC-001 정상") + call("describe", "AC-002 묶음"),
			],
		]);
		expect(checkTrace(input({ rows, testSources }))).toEqual([]);
	});

	test("명세에 없는 AC 를 가리키면 test·it·describe 모두 실패한다", () => {
		const testSources = new Map([
			[
				"a/test/x.test.ts",
				call("test", "AC-900 없음") +
					call("it", "AC-901 없음") +
					call("describe", "AC-902 없음") +
					call("test", "AC-001 정상"),
			],
		]);
		const found = checkTrace(input({ rows, testSources }));
		expect(found.map((v) => v.rule)).toEqual([
			"TRACE-test-unknown-ac",
			"TRACE-test-unknown-ac",
			"TRACE-test-unknown-ac",
		]);
		expect(found.map((v) => v.detail).join()).toContain("AC-902");
	});

	test("이름이 AC 로 시작하지 않으면 보지 않는다", () => {
		const testSources = new Map([
			["a/test/x.test.ts", call("test", "그냥 이름 AC-900 은 중간에 있다")],
		]);
		expect(checkTrace(input({ rows, testSources }))).toEqual([]);
	});
});

describe("실저장소", () => {
	test("추적표·명세·시험 이름이 지금 정합이다", () => {
		const loaded = loadInput(REPO);
		expect(loaded.testSources.size).toBeGreaterThan(0);
		expect(checkTrace(loaded)).toEqual([]);
	});

	test("검증 행(AC-032)의 시험 칸이 실제 시험 소스를 가리킨다 — 검사가 빈 껍데기가 아니다", () => {
		const loaded = loadInput(REPO);
		const broken: TraceInput = {
			...loaded,
			traceText: loaded.traceText.replace(
				"AC-032 라이선스와 콘텐츠 고지`",
				"AC-032 사라진 이름`",
			),
		};
		expect(checkTrace(broken).map((v) => v.rule)).toContain(
			"TRACE-test-name-missing",
		);
	});
});

describe("실행부", () => {
	test("실저장소는 종료 0 이다", async () => {
		const proc = Bun.spawn([process.execPath, "scripts/check-trace.ts"], {
			cwd: REPO,
			stdout: "pipe",
			stderr: "pipe",
		});
		const out = await new Response(proc.stdout).text();
		expect(await proc.exited).toBe(0);
		expect(out).toContain("위반 0");
	});
});
