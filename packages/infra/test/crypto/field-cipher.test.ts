// AesGcmFieldCipher(L2) — ADR-026 단위 검증: 왕복·AAD·변조·iv·키 ID 선택·회전·평문 비노출.
import { describe, expect, test } from "bun:test";
import { PermanentError } from "@pf/kernel";
import {
	AesGcmFieldCipher,
	type Keyring,
	parseKeyring,
} from "../../src/index.ts";

const KEY_1 = Buffer.alloc(32, 1).toString("base64");
const KEY_2 = Buffer.alloc(32, 2).toString("base64");
const AAD = "guestbook.report.note:0190c000-0000-7000-8000-000000000001";
const SENTINEL = "SENTINEL-평문-do-not-leak";

function keyringOf(active: string): Keyring {
	const result = parseKeyring({ active, keys: { k1: KEY_1, k2: KEY_2 } });
	if (!result.ok) {
		throw result.error;
	}
	return result.value;
}

const cipher = new AesGcmFieldCipher(keyringOf("k1"));

function thrownBy(fn: () => unknown): unknown {
	try {
		fn();
	} catch (error) {
		return error;
	}
	throw new Error("던져야 한다");
}

/** 봉투 본문(iv ‖ 암호문 ‖ tag)의 한 바이트를 뒤집는다. 음수는 끝에서부터 센다. */
function flipByte(envelope: string, index: number): string {
	const [version, keyId, encoded = ""] = envelope.split(".");
	const body = Buffer.from(encoded, "base64url");
	const at = index < 0 ? body.length + index : index;
	body[at] = (body[at] ?? 0) ^ 0xff;
	return `${version}.${keyId}.${body.toString("base64url")}`;
}

describe("왕복과 형식", () => {
	test("암호화한 것을 같은 AAD 로 복호화하면 원문이 나온다", () => {
		expect(cipher.decrypt(cipher.encrypt("안녕 hello", AAD), AAD)).toBe(
			"안녕 hello",
		);
	});

	test("빈 문자열도 왕복한다", () => {
		expect(cipher.decrypt(cipher.encrypt("", AAD), AAD)).toBe("");
	});

	test("봉투는 v1.<keyId>.<본문> 이고 본문은 iv 12 + 암호문 + tag 16 바이트다", () => {
		const envelope = cipher.encrypt("abc", AAD);
		const [version, keyId, encoded = ""] = envelope.split(".");
		expect([version, keyId]).toEqual(["v1", "k1"]);
		expect(Buffer.from(encoded, "base64url").length).toBe(12 + 3 + 16);
		expect(envelope).not.toContain("abc");
	});
});

describe("AAD 와 변조는 거부한다", () => {
	const envelope = cipher.encrypt("secret", AAD);

	test("다른 AAD(다른 행·컬럼)로는 복호화되지 않는다", () => {
		expect(
			thrownBy(() => cipher.decrypt(envelope, `${AAD.slice(0, -1)}2`)),
		).toBeInstanceOf(PermanentError);
		expect(
			thrownBy(() => cipher.decrypt(envelope, "guestbook.report.note:other")),
		).toBeInstanceOf(PermanentError);
	});

	test.each([
		["iv", 0],
		["암호문", 12],
		["tag", -1],
	])("%s 를 한 바이트 바꾸면 거부한다", (_part, index) => {
		expect(
			thrownBy(() => cipher.decrypt(flipByte(envelope, index), AAD)),
		).toBeInstanceOf(PermanentError);
	});

	test("다른 키로 감싼 봉투는 거부한다", () => {
		const other = new AesGcmFieldCipher(
			(() => {
				const parsed = parseKeyring({
					active: "k1",
					keys: { k1: KEY_2 },
				});
				if (!parsed.ok) {
					throw parsed.error;
				}
				return parsed.value;
			})(),
		);
		expect(thrownBy(() => other.decrypt(envelope, AAD))).toBeInstanceOf(
			PermanentError,
		);
	});
});

describe("iv", () => {
	test("같은 평문을 두 번 암호화하면 다른 봉투다", () => {
		expect(cipher.encrypt("same", AAD)).not.toBe(cipher.encrypt("same", AAD));
	});

	test("1000번 암호화해도 iv 가 겹치지 않는다", () => {
		const ivs = new Set<string>();
		for (let i = 0; i < 1000; i += 1) {
			const encoded = cipher.encrypt("x", AAD).split(".")[2] ?? "";
			ivs.add(
				Buffer.from(encoded, "base64url").subarray(0, 12).toString("hex"),
			);
		}
		expect(ivs.size).toBe(1000);
	});
});

describe("봉투 형식 오류와 키 ID 선택", () => {
	const good = cipher.encrypt("x", AAD);
	const body = good.split(".")[2] ?? "";

	test.each([
		["분절 수 부족", `v1.${body}`],
		["분절 수 초과", `${good}.extra`],
		["접두가 다름", `v2.k1.${body}`],
		["빈 문자열", ""],
		["keyId 대문자", `v1.K1.${body}`],
		["keyId 비어 있음", `v1..${body}`],
		["keyId 33자", `v1.${"a".repeat(33)}.${body}`],
		["본문이 28바이트 미만", `v1.k1.${Buffer.alloc(27).toString("base64url")}`],
		["본문에 잡음 문자", `v1.k1.${body}!!`],
	])("%s 는 PermanentError 다", (_label, envelope) => {
		expect(thrownBy(() => cipher.decrypt(envelope, AAD))).toBeInstanceOf(
			PermanentError,
		);
	});

	test("키링에 없는 keyId 는 PermanentError 이고 details 에 keyId 만 있다", () => {
		const error = thrownBy(() => cipher.decrypt(`v1.k9.${body}`, AAD));
		expect(error).toBeInstanceOf(PermanentError);
		expect(error instanceof PermanentError && error.details).toEqual({
			keyId: "k9",
		});
	});

	test("복호화 키는 봉투의 keyId 로 고른다 — active 가 바뀌어도 옛 봉투가 열린다", () => {
		const old = cipher.encrypt("옛 값", AAD);
		const rotated = new AesGcmFieldCipher(keyringOf("k2"));
		expect(rotated.decrypt(old, AAD)).toBe("옛 값");
		expect(rotated.encrypt("x", AAD).split(".")[1]).toBe("k2");
	});
});

describe("rewrap", () => {
	test("이미 active 키인 봉투는 입력 그대로 돌려준다(멱등)", () => {
		const envelope = cipher.encrypt("v", AAD);
		expect(cipher.rewrap(envelope, AAD)).toBe(envelope);
		expect(cipher.rewrap(cipher.rewrap(envelope, AAD), AAD)).toBe(envelope);
	});

	test("옛 키 봉투는 active 로 다시 감싸고 원문은 같다", () => {
		const old = cipher.encrypt("회전 대상", AAD);
		const rotated = new AesGcmFieldCipher(keyringOf("k2"));
		const next = rotated.rewrap(old, AAD);
		expect(next.split(".")[1]).toBe("k2");
		expect(next).not.toBe(old);
		expect(rotated.decrypt(next, AAD)).toBe("회전 대상");
		expect(rotated.rewrap(next, AAD)).toBe(next);
	});

	test("옛 키 봉투를 틀린 AAD 로 감싸려 하면 거부한다", () => {
		const old = cipher.encrypt("v", AAD);
		const rotated = new AesGcmFieldCipher(keyringOf("k2"));
		expect(thrownBy(() => rotated.rewrap(old, "other"))).toBeInstanceOf(
			PermanentError,
		);
	});

	test("형식이 틀린 봉투는 active 여부와 무관하게 거부한다", () => {
		expect(thrownBy(() => cipher.rewrap("v1.k1.x", AAD))).toBeInstanceOf(
			PermanentError,
		);
	});
});

describe("오류는 평문·키를 싣지 않는다", () => {
	test("실패한 어떤 경로의 오류에도 센티널 평문·키·AAD·봉투 본문이 없다", () => {
		const envelope = cipher.encrypt(SENTINEL, AAD);
		const body = envelope.split(".")[2] ?? "";
		const errors = [
			thrownBy(() => cipher.decrypt(envelope, "다른-aad")),
			thrownBy(() => cipher.decrypt(flipByte(envelope, -1), AAD)),
			thrownBy(() => cipher.decrypt(`v1.k9.${body}`, AAD)),
			thrownBy(() => cipher.decrypt(`v1.k1.${body}!`, AAD)),
		];
		for (const error of errors) {
			expect(error).toBeInstanceOf(PermanentError);
			const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
			for (const secret of [SENTINEL, KEY_1, KEY_2, AAD, body]) {
				expect(text).not.toContain(secret);
			}
		}
	});
});
