import { describe, expect, test } from "bun:test";
import type { ContractErrorDto } from "../src/index.ts";

const GOLDEN = new URL("../golden/contract-error.v1.json", import.meta.url);

describe("ContractErrorDto 골든", () => {
	test("골든은 code·message·traceId 만 갖는다 — kind·name 으로 판별하지 않는다", async () => {
		const golden: ContractErrorDto = await Bun.file(GOLDEN).json();
		expect(Object.keys(golden).sort()).toEqual(["code", "message", "traceId"]);
	});

	test("code 는 비어 있지 않은 문자열이고 traceId 는 uuid 모양이다", async () => {
		const golden: ContractErrorDto = await Bun.file(GOLDEN).json();
		expect(golden.code.length).toBeGreaterThan(0);
		expect(golden.traceId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});
});
