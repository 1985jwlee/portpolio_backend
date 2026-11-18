// B3(CQRS) 판정 시험 — 메모리 입력만 쓴다. 파일·네트워크·시계를 읽지 않는다.
import { describe, expect, test } from "bun:test";
import { type CqrsInput, checkCqrs } from "./check-cqrs.ts";

const WRITE_PORT = "modules/m/src/port/w.ts";
const READ_PORT = "modules/m/src/port/r.ts";
const COMMAND = "modules/m/src/usecase/command/c.ts";
const QUERY = "modules/m/src/usecase/query/q.ts";

const declaration = {
	ports: {
		"src/port/w.ts": { kind: "write", tables: ["m.entry"] },
		"src/port/r.ts": { kind: "read", tables: ["m_read.entry_view"] },
	},
};

function input(over: Partial<CqrsInput> = {}): CqrsInput {
	return {
		edges: [],
		files: new Set([WRITE_PORT, READ_PORT, COMMAND, QUERY]),
		declarations: new Map<string, unknown>([["m", declaration]]),
		exceptions: undefined,
		...over,
	};
}

const labels = (i: CqrsInput) =>
	checkCqrs(i).map((v) => `${v.rule} ${v.from}${v.to ? ` → ${v.to}` : ""}`);

describe("usecase 방향", () => {
	test("command → 쓰기 포트, query → 읽기 포트는 통과한다", () => {
		expect(
			labels(
				input({
					edges: [
						{ from: COMMAND, to: WRITE_PORT },
						{ from: QUERY, to: READ_PORT },
					],
				}),
			),
		).toEqual([]);
	});

	test("command → 읽기 포트는 B3-command-read", () => {
		expect(
			labels(input({ edges: [{ from: COMMAND, to: READ_PORT }] })),
		).toEqual([`B3-command-read ${COMMAND} → ${READ_PORT}`]);
	});

	test("query → 쓰기 포트는 B3-query-write", () => {
		expect(labels(input({ edges: [{ from: QUERY, to: WRITE_PORT }] }))).toEqual(
			[`B3-query-write ${QUERY} → ${WRITE_PORT}`],
		);
	});

	test("선언 없는 포트는 B3-undeclared-port 다 — 선언 파일이 아예 없어도 같다", () => {
		const edge = { from: QUERY, to: "modules/m/src/port/other.ts" };
		expect(labels(input({ edges: [edge] }))).toEqual([
			`B3-undeclared-port ${edge.from} → ${edge.to}`,
		]);
		expect(labels(input({ edges: [edge], declarations: new Map() }))).toEqual([
			`B3-undeclared-port ${edge.from} → ${edge.to}`,
		]);
	});

	test("usecase/event 와 port 밖으로 가는 간선은 이 규칙의 대상이 아니다", () => {
		expect(
			labels(
				input({
					edges: [
						{ from: "modules/m/src/usecase/event/e.ts", to: WRITE_PORT },
						{ from: QUERY, to: "modules/m/src/domain/d.ts" },
					],
				}),
			),
		).toEqual([]);
	});

	test("같은 간선이 여러 번 와도 한 건이다", () => {
		const edge = { from: COMMAND, to: READ_PORT };
		expect(labels(input({ edges: [edge, edge] }))).toHaveLength(1);
	});
});

describe("예외 등록", () => {
	const exception = (reader: string, schemaObject: string) => ({
		exceptions: [{ id: "X1", reader, schemaObject }],
	});

	test("예외가 걸린 표를 모두 덮을 때만 방향 위반이 사라진다", () => {
		const edges = [{ from: COMMAND, to: READ_PORT }];
		expect(
			labels(
				input({ edges, exceptions: exception(COMMAND, "m_read.entry_view") }),
			),
		).toEqual([]);
		// 표가 다르면 덮이지 않는다.
		expect(
			labels(input({ edges, exceptions: exception(COMMAND, "m_read.other") })),
		).toHaveLength(1);
		// reader 가 다른 usecase 면 덮이지 않는다.
		expect(
			labels(
				input({
					edges,
					exceptions: exception(
						"modules/m/src/usecase/command/else.ts",
						"m_read.entry_view",
					),
				}),
			),
		).toHaveLength(1);
	});

	test("포트가 reader 인 예외는 그 포트를 쓰는 usecase 방향 위반도 덮는다", () => {
		expect(
			labels(
				input({
					edges: [{ from: COMMAND, to: READ_PORT }],
					exceptions: exception(READ_PORT, "m_read.entry_view"),
				}),
			),
		).toEqual([]);
	});

	test("예외를 무시하면 안 된다 — 읽기 포트가 쓰기 표를 선언하는 X3 형은 예외가 있어야 통과한다", () => {
		const x3 = {
			ports: {
				"src/port/r.ts": { kind: "read", tables: ["m.trace_step"] },
			},
		};
		const withoutException = input({
			declarations: new Map([["m", x3]]),
		});
		expect(labels(withoutException)).toEqual([
			"B3-declaration modules/m/port-kinds.json → modules/m/src/port/r.ts",
		]);
		expect(
			labels({
				...withoutException,
				exceptions: exception(READ_PORT, "m.trace_step"),
			}),
		).toEqual([]);
	});

	test("예외 파일의 형식이 틀리면 B3-declaration 이고 맞는 항목은 계속 쓰인다", () => {
		const result = labels(
			input({
				edges: [{ from: COMMAND, to: READ_PORT }],
				exceptions: {
					exceptions: [
						{ id: "X1", reader: COMMAND, schemaObject: "m_read.entry_view" },
						{ id: "X2" },
					],
				},
			}),
		);
		expect(result).toEqual(["B3-declaration modules/cqrs-exceptions.json"]);
		expect(labels(input({ exceptions: null }))).toEqual([
			"B3-declaration modules/cqrs-exceptions.json",
		]);
	});
});

describe("선언 정합 (B3-declaration)", () => {
	const decl = (ports: unknown) =>
		input({ declarations: new Map([["m", { ports }]]) });
	const reasons = (i: CqrsInput) => checkCqrs(i).map((v) => v.detail ?? "");

	test("kind 가 write·read 가 아니면 위반이다", () => {
		expect(
			reasons(decl({ "src/port/w.ts": { kind: "rw", tables: ["m.a"] } })),
		).toEqual(['kind 는 "write" 또는 "read" 여야 한다']);
	});

	test("tables 가 비었거나 문자열이 아니면 위반이다", () => {
		// 읽기 포트로 시험한다 — 쓰기 포트는 빈 tables 를 "쓰기 표 하나 이상" 위반이 대신 잡아 이 분기를 지워도 초록이 된다.
		expect(
			reasons(decl({ "src/port/r.ts": { kind: "read", tables: [] } })),
		).toEqual(["tables 는 비지 않은 문자열 배열이어야 한다"]);
		expect(
			reasons(decl({ "src/port/w.ts": { kind: "write", tables: [1] } })),
		).toHaveLength(1);
	});

	test("표의 스키마가 <m> 도 <m>_read 도 아니면 위반이다", () => {
		const r = reasons(
			decl({ "src/port/w.ts": { kind: "write", tables: ["m.a", "x.b"] } }),
		);
		expect(r).toHaveLength(1);
		expect(r[0]).toContain('"x.b"');
	});

	test("<스키마>.<표> 형식이 아니면 위반이다", () => {
		expect(
			reasons(decl({ "src/port/w.ts": { kind: "write", tables: ["m"] } }))
				.length,
		).toBeGreaterThan(0);
		// 점이 둘이면 parts[1] 이 비어 있지 않아 `!parts[1]` 로는 안 잡힌다 — parts.length 판정이 맡는다.
		expect(
			reasons(decl({ "src/port/w.ts": { kind: "write", tables: ["m.a.b"] } })),
		).toEqual(['표 "m.a.b" 는 <스키마>.<표> 형식이어야 한다']);
	});

	test("읽기 포트가 쓰기 스키마 표를 선언하면(예외 없음) 위반이다", () => {
		expect(
			reasons(decl({ "src/port/r.ts": { kind: "read", tables: ["m.entry"] } })),
		).toHaveLength(1);
	});

	test("쓰기 포트가 쓰기 스키마 표를 하나도 안 갖고 있으면 위반이다", () => {
		expect(
			reasons(
				decl({ "src/port/w.ts": { kind: "write", tables: ["m_read.v"] } }),
			),
		).toHaveLength(1);
	});

	test("선언한 포트 파일이 검사 결과에 없으면 위반이다", () => {
		const i = input({ files: new Set([COMMAND]) });
		expect(checkCqrs(i).map((v) => v.to)).toEqual([WRITE_PORT, READ_PORT]);
	});

	test("계약 패키지(-contract)에 선언을 두면 위반이다", () => {
		const i = input({ declarations: new Map([["m-contract", declaration]]) });
		expect(labels(i)).toEqual([
			"B3-declaration modules/m-contract/port-kinds.json",
		]);
	});

	test("파싱 실패(null)·최상위 형식 오류는 위반이고 그 모듈의 방향 판정은 건너뛴다", () => {
		for (const bad of [null, [], { ports: [] }, { nope: 1 }]) {
			const i = input({
				declarations: new Map<string, unknown>([["m", bad]]),
				edges: [{ from: COMMAND, to: READ_PORT }],
			});
			expect(labels(i)).toEqual(["B3-declaration modules/m/port-kinds.json"]);
		}
	});

	test("형식이 틀린 선언 하나가 다른 모듈의 판정을 막지 않는다", () => {
		const i = input({
			declarations: new Map<string, unknown>([
				["bad", null],
				["m", declaration],
			]),
			edges: [{ from: COMMAND, to: READ_PORT }],
		});
		expect(labels(i)).toEqual([
			"B3-declaration modules/bad/port-kinds.json",
			`B3-command-read ${COMMAND} → ${READ_PORT}`,
		]);
	});
});
