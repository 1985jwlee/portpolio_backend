// DetailValidator(L2) — 금지 키·평면성·값 형식·길이·키 수. 규칙마다 "거부되는 입력" 과 바로 옆의 "통과하는 입력" 을 짝지어 둔다.
import { describe, expect, test } from "bun:test";
import { PermanentError } from "@pf/kernel";
import {
	DETAIL_MAX_KEYS,
	DETAIL_MAX_STRING_LENGTH,
	DetailValidator,
} from "../src/audit/detail-validator.ts";

const validator = new DetailValidator();

function rejects(detail: unknown): PermanentError {
	try {
		validator.check(detail);
	} catch (error) {
		if (!(error instanceof PermanentError)) {
			throw error;
		}
		return error;
	}
	throw new Error("거부되어야 하는 detail 이 통과했다");
}

describe("DetailValidator — 통과", () => {
	test("빈 객체와 작은 평면 객체(문자열·숫자·불리언·null)는 통과한다", () => {
		validator.check({});
		validator.check({ count: 3, version: 2, from: "a", to: "b" });
		validator.check({ flag: true, off: false, none: null, ratio: 0.5 });
	});

	test("문자열 200자·키 16개는 통과한다(경계)", () => {
		validator.check({ text: "가".repeat(DETAIL_MAX_STRING_LENGTH) });
		const keys = Object.fromEntries(
			Array.from({ length: DETAIL_MAX_KEYS }, (_, i) => [`k${i}`, i]),
		);
		validator.check(keys);
	});

	test("금지 키 이름을 일부로 가진 키(body_length)는 통과한다 — 이름 일치만 본다", () => {
		validator.check({ body_length: 12, notes: 1 });
	});
});

describe("DetailValidator — 금지 키", () => {
	for (const key of ["body", "note", "token", "ip", "cookie"]) {
		test(`'${key}' 는 거부하고 키 이름을 오류에 싣는다`, () => {
			const error = rejects({ [key]: "x" });
			expect(error.details).toEqual({ key });
		});
	}

	test("대소문자를 무시한다", () => {
		for (const key of ["Body", "NOTE", "Token", "iP", "COOKIE"]) {
			rejects({ [key]: "x" });
		}
	});

	test("다른 키가 함께 있어도 금지 키 하나로 거부한다", () => {
		rejects({ count: 1, cookie: "x", version: 2 });
	});
});

describe("DetailValidator — 형식", () => {
	test("평면 객체가 아니면 거부한다(null·배열·원시값·클래스 인스턴스)", () => {
		for (const bad of [null, undefined, [], [1], "x", 1, true, new Date()]) {
			rejects(bad);
		}
	});

	test("중첩 객체·배열 값은 거부한다", () => {
		rejects({ nested: { a: 1 } });
		rejects({ list: [1, 2] });
	});

	test("문자열·숫자·불리언·null 이 아닌 값은 거부한다", () => {
		rejects({ missing: undefined });
		rejects({ big: 1n });
		rejects({ fn: () => 1 });
		rejects({ symbol: Symbol("x") });
		rejects({ when: new Date() });
	});

	test("NaN·Infinity 는 거부한다", () => {
		rejects({ n: Number.NaN });
		rejects({ n: Number.POSITIVE_INFINITY });
	});
});

describe("DetailValidator — 상한", () => {
	test("문자열 201자는 거부하고 길이만 오류에 싣는다", () => {
		const error = rejects({ text: "x".repeat(DETAIL_MAX_STRING_LENGTH + 1) });
		expect(error.details).toEqual({
			key: "text",
			length: DETAIL_MAX_STRING_LENGTH + 1,
		});
	});

	test("키 17개는 거부한다", () => {
		const keys = Object.fromEntries(
			Array.from({ length: DETAIL_MAX_KEYS + 1 }, (_, i) => [`k${i}`, i]),
		);
		const error = rejects(keys);
		expect(error.details).toEqual({ keyCount: DETAIL_MAX_KEYS + 1 });
	});
});

describe("DetailValidator — 값이 새지 않는다", () => {
	test("오류 메시지·details 어디에도 값이 없다", () => {
		const secret = "SENTINEL-secret-value-123";
		const cases: unknown[] = [
			{ token: secret },
			{ nested: { inner: secret } },
			{ text: secret.repeat(20) },
		];
		for (const detail of cases) {
			const error = rejects(detail);
			expect(error.message).not.toContain(secret);
			expect(JSON.stringify(error.details)).not.toContain(secret);
		}
	});
});
