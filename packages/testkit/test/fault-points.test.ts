import { describe, expect, test } from "bun:test";
import { FAULT_POINTS } from "../src/index.ts";

// F16 §13.6 본문에서 지점 이름을 직접 뽑는다 — 상수 목록과 문서가 갈라지면 이 시험이 실패한다.
const DOC = new URL(
	"../../../docs/design/features/16-cross-cutting.md",
	import.meta.url,
);
const POINT_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

async function documentedPoints(): Promise<string[]> {
	const text = await Bun.file(DOC).text();
	const start = text.indexOf("### 13.6 ");
	const end = text.indexOf("### 13.7 ");
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	const section = text.slice(start, end);
	const names = [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
	// 자리표시자(`<usecase>`)는 `<` 때문에 형식에 맞지 않아 빠진다.
	return names.filter((n) => POINT_NAME.test(n));
}

describe("FAULT_POINTS", () => {
	test("값 집합이 F16 §13.6 의 구체 지점 이름과 같다", async () => {
		const documented = new Set(await documentedPoints());
		expect(documented.size).toBe(6);
		expect(new Set<string>(Object.values(FAULT_POINTS))).toEqual(documented);
	});

	test("모든 값이 `<모듈>.<컴포넌트>.<지점>` 소문자 snake_case 다", () => {
		for (const name of Object.values(FAULT_POINTS)) {
			expect(name).toMatch(POINT_NAME);
		}
	});
});
