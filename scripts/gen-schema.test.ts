import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { protocolRegistry } from "@pf/protocol";
import {
	diffSchemas,
	isClean,
	renderSchemas,
	serializeSchema,
} from "./gen-schema.ts";

const SCHEMA_DIR = new URL("../packages/protocol/schema/", import.meta.url);

describe("serializeSchema", () => {
	test("키 순서와 무관하게 같은 문자열이고 끝 개행이 있다", () => {
		const a = serializeSchema({ b: 1, a: { d: 2, c: 3 } });
		const b = serializeSchema({ a: { c: 3, d: 2 }, b: 1 });
		expect(a).toBe(b);
		expect(a.endsWith("}\n")).toBe(true);
	});

	test("TypeBox 의 Symbol 키는 출력에 실리지 않는다", () => {
		expect(
			serializeSchema({ [Symbol("kind")]: "String", type: "string" }),
		).toBe('{\n\t"type": "string"\n}\n');
	});
});

describe("diffSchemas", () => {
	const expected = new Map([
		["a.json", "1"],
		["b.json", "2"],
	]);

	test("같으면 깨끗하다", () => {
		expect(isClean(diffSchemas(expected, new Map(expected)))).toBe(true);
	});

	test("없는 파일·다른 파일·남는 파일을 각각 보고한다", () => {
		const diff = diffSchemas(
			expected,
			new Map([
				["b.json", "다름"],
				["z.json", "남음"],
			]),
		);
		expect(diff).toEqual({
			missing: ["a.json"],
			changed: ["b.json"],
			stale: ["z.json"],
		});
		expect(isClean(diff)).toBe(false);
	});
});

describe("커밋된 schema/ 폴더", () => {
	test("등록된 스키마를 지금 내보낸 결과와 한 글자도 다르지 않다 (gen:schema --check 와 같은 판정)", async () => {
		const actual = new Map<string, string>();
		for (const name of readdirSync(SCHEMA_DIR).filter((f) =>
			f.endsWith(".json"),
		)) {
			actual.set(name, await Bun.file(new URL(name, SCHEMA_DIR)).text());
		}
		const diff = diffSchemas(renderSchemas(protocolRegistry), actual);
		expect(diff).toEqual({ missing: [], changed: [], stale: [] });
	});
});
