import { describe, expect, test } from "bun:test";
import { FakeIdGenerator } from "../src/index.ts";

// uuid v7: 세 번째 묶음이 7 로 시작하고 네 번째 묶음이 8~b 로 시작한다.
const V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("FakeIdGenerator", () => {
	test("생성한 값은 uuid v7 형식이다", () => {
		const ids = new FakeIdGenerator();
		for (let i = 0; i < 20; i++) {
			expect(ids.next()).toMatch(V7);
		}
	});

	test("문자열 정렬 순서가 생성 순서와 같다 (자릿수가 올라가는 경계 포함)", () => {
		const ids = new FakeIdGenerator(0xfff0);
		const made = Array.from({ length: 40 }, () => ids.next());
		expect([...made].sort()).toEqual(made);
		expect(new Set(made).size).toBe(made.length);
	});

	test("reset 하면 같은 시드에서 같은 열이 다시 나온다", () => {
		const ids = new FakeIdGenerator();
		const first = [ids.next(), ids.next()];
		ids.reset(0);
		expect([ids.next(), ids.next()]).toEqual(first);
	});
});
