import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
	DISPLAY_NAME_MAX_CHARS,
	DISPLAY_NAME_MIN_CHARS,
	ENTRY_BODY_MAX_CHARS,
	ENTRY_BODY_MAX_LINES,
	isDateTime,
	isUuid,
	ProtocolRegistry,
	protocolRegistry,
	REPORT_REASON_MAX_CHARS,
} from "../src/index.ts";

const PACKAGE_DIR = new URL("../", import.meta.url);
const GOLDEN_DIR = new URL("golden/", PACKAGE_DIR);

async function readGolden(name: string): Promise<unknown> {
	return Bun.file(new URL(`${name}.json`, GOLDEN_DIR)).json();
}

describe("골든 왕복", () => {
	const names = protocolRegistry.entries().map(([name]) => name);

	test("등록된 모든 스키마에 골든이 있고, 골든마다 등록된 스키마가 있다", () => {
		const goldens = readdirSync(GOLDEN_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(/\.json$/, ""))
			.sort();
		expect(goldens).toEqual([...names].sort());
		expect(names.length).toBeGreaterThan(0);
	});

	for (const name of names) {
		test(`${name}: 검사 → 디코드 → 인코드 하면 원본과 같다`, async () => {
			const schema = protocolRegistry.get(name);
			expect(schema).toBeDefined();
			if (schema === undefined) {
				return;
			}
			const golden = await readGolden(name);
			expect(Value.Check(schema, golden)).toBe(true);
			const decoded = Value.Decode(schema, golden);
			expect(Value.Encode(schema, decoded)).toEqual(golden);
		});
	}
});

describe("스키마 판정", () => {
	test("서버 전용 필드가 없는 클라이언트 hello 만 통과하고 locale·v 위반은 거부한다", async () => {
		const hello = protocolRegistry.get("ws.client-hello.v1");
		const golden = (await readGolden("ws.client-hello.v1")) as {
			d: Record<string, unknown>;
		};
		expect(hello).toBeDefined();
		if (hello === undefined) {
			return;
		}
		expect(Value.Check(hello, { ...golden, v: 2 })).toBe(false);
		expect(Value.Check(hello, { ...golden, d: { locale: "jp" } })).toBe(false);
		expect(
			Value.Check(hello, { ...golden, d: { resume: -1, locale: "ko" } }),
		).toBe(false);
	});

	test("이벤트 봉투는 ownerKey 가 null 이어도 되지만 형식이 틀린 문자열은 거부한다", async () => {
		const envelope = protocolRegistry.get("events.envelope.v1");
		const golden = (await readGolden("events.envelope.v1")) as object;
		expect(envelope).toBeDefined();
		if (envelope === undefined) {
			return;
		}
		expect(Value.Check(envelope, { ...golden, ownerKey: null })).toBe(true);
		expect(Value.Check(envelope, { ...golden, ownerKey: "guest:abc" })).toBe(
			false,
		);
		expect(
			Value.Check(envelope, { ...golden, occurredAt: "2026-11-04 09:00" }),
		).toBe(false);
		expect(Value.Check(envelope, { ...golden, schemaVersion: 0 })).toBe(false);
	});

	test("format 검증기: uuid·date-time 은 UTC Z 표기만 받는다", () => {
		expect(isUuid("0192f3c0-7a10-7000-8000-000000000001")).toBe(true);
		expect(isUuid("not-a-uuid")).toBe(false);
		expect(isDateTime("2026-11-04T09:00:00.123Z")).toBe(true);
		expect(isDateTime("2026-11-04T09:00:00+09:00")).toBe(false);
		expect(isDateTime("2026-13-40T99:00:00Z")).toBe(false);
	});
});

describe("레지스트리", () => {
	test("registerEvent 는 `<type>.v<N>` 이름으로 등록·조회하고 중복·잘못된 버전을 거부한다", () => {
		const registry = new ProtocolRegistry();
		const schema = Type.Object({ entryId: Type.String() });
		registry.registerEvent("entry.posted", 1, schema);
		expect(registry.getEvent("entry.posted", 1)).toBe(schema);
		expect(registry.getEvent("entry.posted", 2)).toBeUndefined();
		expect(() => registry.registerEvent("entry.posted", 1, schema)).toThrow();
		expect(() => registry.registerEvent("entry.edited", 0, schema)).toThrow();
	});

	test("entries 는 등록 순서와 무관하게 이름순이다", () => {
		const registry = new ProtocolRegistry();
		registry.register("b.v1", Type.String());
		registry.register("a.v1", Type.String());
		expect(registry.entries().map(([name]) => name)).toEqual(["a.v1", "b.v1"]);
	});
});

describe("상수와 의존", () => {
	test("01 §8.6 의 값 그대로다 (ALLOWED_EMOJI 는 목록 미확정이라 없다)", () => {
		expect([
			ENTRY_BODY_MAX_CHARS,
			ENTRY_BODY_MAX_LINES,
			DISPLAY_NAME_MIN_CHARS,
			DISPLAY_NAME_MAX_CHARS,
			REPORT_REASON_MAX_CHARS,
		]).toEqual([500, 10, 2, 20, 200]);
	});

	test("@sinclair/typebox 0.34 를 정확한 버전으로 쓰고 typebox(1.x) 는 쓰지 않는다", async () => {
		const pkg = (await Bun.file(
			new URL("package.json", PACKAGE_DIR),
		).json()) as {
			dependencies: Record<string, string>;
		};
		expect(pkg.dependencies["@sinclair/typebox"]).toMatch(/^0\.34\.\d+$/);
		expect(Object.keys(pkg.dependencies)).not.toContain("typebox");
	});
});
