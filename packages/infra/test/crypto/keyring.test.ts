// parseKeyring — 형식 검증과 "오류에 키 값이 실리지 않는다".
import { describe, expect, test } from "bun:test";
import { ConfigError } from "@pf/kernel";
import { parseKeyring } from "../../src/index.ts";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

function failure(raw: unknown): ConfigError {
	const result = parseKeyring(raw);
	if (result.ok) {
		throw new Error("Err 여야 한다");
	}
	return result.error;
}

describe("parseKeyring 성공", () => {
	test("객체 키링을 읽는다 — 키는 32바이트로 풀린다", () => {
		const result = parseKeyring({
			active: "k2",
			keys: { k1: KEY_A, k2: KEY_B },
		});
		if (!result.ok) {
			throw result.error;
		}
		expect(result.value.active).toBe("k2");
		expect([...result.value.keys.keys()]).toEqual(["k1", "k2"]);
		expect(result.value.keys.get("k1")).toEqual(new Uint8Array(32).fill(1));
	});

	test("문자열이면 JSON 으로 읽는다(환경변수·시크릿 파일 입력)", () => {
		const result = parseKeyring(
			JSON.stringify({ active: "k1", keys: { k1: KEY_A } }),
		);
		expect(result.ok).toBe(true);
	});
});

describe("parseKeyring 실패는 ConfigError 다", () => {
	test.each([
		["null", null],
		["배열", []],
		["문자열이 JSON 이 아님", "not json"],
		["active 없음", { keys: { k1: KEY_A } }],
		["active 형식 오류", { active: "K1!", keys: { K1: KEY_A } }],
		["keys 가 비어 있음", { active: "k1", keys: {} }],
		["keys 가 객체가 아님", { active: "k1", keys: [KEY_A] }],
		["active 가 keys 에 없음", { active: "k9", keys: { k1: KEY_A } }],
		["키 ID 형식 오류", { active: "k1", keys: { k1: KEY_A, "bad id": KEY_B } }],
		[
			"키 길이 31바이트",
			{ active: "k1", keys: { k1: Buffer.alloc(31).toString("base64") } },
		],
		[
			"키 길이 33바이트",
			{ active: "k1", keys: { k1: Buffer.alloc(33).toString("base64") } },
		],
		["base64 가 아님", { active: "k1", keys: { k1: `${"!".repeat(43)}=` } }],
		["키가 문자열이 아님", { active: "k1", keys: { k1: 123 } }],
	])("%s", (_label, raw) => {
		expect(failure(raw)).toBeInstanceOf(ConfigError);
	});

	test("오류에 키 값도 JSON 원문 조각도 실리지 않는다", () => {
		const secretLike = Buffer.alloc(31, 7).toString("base64");
		const errors = [
			failure({ active: "k1", keys: { k1: secretLike } }),
			failure(`{"active":"k1","keys":{"k1":"${secretLike}"`),
			failure({ active: "k1", keys: { [secretLike]: KEY_A } }),
		];
		for (const error of errors) {
			const text = JSON.stringify({
				message: error.message,
				details: error.details,
				cause: String(error.cause),
			});
			expect(text).not.toContain(secretLike);
		}
	});
});
