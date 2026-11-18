// 형 변환 엄격성 시험 — 공개 표면(loadConfig + MapEnvSource)만 거친다. parse.ts 는 내보내지 않는다.
// 기대값은 설계 결정 D11 에서 옮겨 적었다. 정수는 Number()·parseInt 로 판정하면 아래 실패 행이 통과로 뒤집힌다.
import { describe, expect, test } from "bun:test";
import { defineSchema, field, loadConfig, MapEnvSource } from "@pf/config";

type Schema = Parameters<typeof loadConfig>[0];

// 필드 하나짜리 스키마에 값 하나를 넣어 로드한다. 성공이면 값, 실패면 사유 코드(와 오류 직렬화)를 돌려준다.
function parseWith(schema: Schema, raw: string) {
	const result = loadConfig(schema, new MapEnvSource({ X: raw }));
	if (result.ok) {
		return { ok: true as const, value: result.value.config.X };
	}
	return {
		ok: false as const,
		details: result.error.details,
		serialized: JSON.stringify(result.error),
	};
}

function expectFailure(schema: Schema, raw: string, reason: string): void {
	const outcome = parseWith(schema, raw);
	expect(outcome.ok).toBe(false);
	if (!outcome.ok) {
		expect(outcome.details).toEqual({
			missing: [],
			invalid: [{ name: "X", reason }],
			violations: [],
		});
	}
}

describe("int", () => {
	const schema = defineSchema({ X: field.int() });

	test.each([
		["0", 0],
		["-1", -1],
		["42", 42],
	])("%p → %p", (raw, expected) => {
		expect(parseWith(schema, raw)).toEqual({ ok: true, value: expected });
	});

	test.each([
		" ",
		" 1",
		"1 ",
		"1.0",
		"1e3",
		"0x10",
		"+1",
		"9007199254740993",
		"12abc",
	])("%p 는 not_int", (raw) => {
		expectFailure(schema, raw, "not_int");
	});
});

describe("bool", () => {
	const schema = defineSchema({ X: field.bool() });

	test.each([
		["true", true],
		["1", true],
		["false", false],
		["0", false],
	])("%p → %p", (raw, expected) => {
		expect(parseWith(schema, raw)).toEqual({ ok: true, value: expected });
	});

	test.each(["TRUE", "yes", " true", "2"])("%p 는 not_bool", (raw) => {
		expectFailure(schema, raw, "not_bool");
	});
});

describe("url", () => {
	const schema = defineSchema({ X: field.url() });

	test.each(["http://localhost:8080", "postgres://u:p@h:5432/db"])(
		"%p 는 원래 문자열 그대로 성공",
		(raw) => {
			expect(parseWith(schema, raw)).toEqual({ ok: true, value: raw });
		},
	);

	test.each(["::x", "http://[bad"])("%p 는 not_url", (raw) => {
		expectFailure(schema, raw, "not_url");
	});
});

describe("enum", () => {
	const schema = defineSchema({ X: field.oneOf(["a", "b"]) });

	test("정확 일치만 성공", () => {
		expect(parseWith(schema, "a")).toEqual({ ok: true, value: "a" });
	});

	test.each(["A", "c", "a "])("%p 는 not_enum", (raw) => {
		expectFailure(schema, raw, "not_enum");
	});
});

describe("csv-int", () => {
	const schema = defineSchema({ X: field.csvInt() });

	test("쉼표로 나눈 정수들", () => {
		expect(parseWith(schema, "1,2,3")).toEqual({ ok: true, value: [1, 2, 3] });
	});

	test.each(["1, 2", "1,,2", ",1", "1,", "a"])("%p 는 not_csv_int", (raw) => {
		expectFailure(schema, raw, "not_csv_int");
	});
});

describe("string minBytes", () => {
	const schema = defineSchema({ X: field.string({ minBytes: 32 }) });

	test("ASCII 32자는 성공, 31자는 too_short", () => {
		expect(parseWith(schema, "a".repeat(32))).toEqual({
			ok: true,
			value: "a".repeat(32),
		});
		expectFailure(schema, "a".repeat(31), "too_short");
	});

	test("문자 수가 아니라 바이트 수다 — é×16 은 32바이트라 성공", () => {
		expect(parseWith(schema, "é".repeat(16)).ok).toBe(true);
	});
});

describe("실패 결과에 입력 문자열이 없다", () => {
	test("잘못된 값을 센티널로 줘도 오류의 직렬화에 없다", () => {
		const sentinel = crypto.randomUUID();
		const schemas = [
			defineSchema({ X: field.int() }),
			defineSchema({ X: field.bool() }),
			defineSchema({ X: field.url() }),
			defineSchema({ X: field.oneOf(["a"]) }),
			defineSchema({ X: field.csvInt() }),
			defineSchema({ X: field.string({ minBytes: 1000 }) }),
		];
		for (const schema of schemas) {
			const outcome = parseWith(schema, sentinel);
			expect(outcome.ok).toBe(false);
			if (!outcome.ok) {
				expect(outcome.serialized).not.toContain(sentinel);
			}
		}
	});
});
