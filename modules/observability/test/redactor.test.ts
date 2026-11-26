// Redactor(L2) — 거부목록 키 15개·값 패턴 5종·대소문자·재귀·순환·깊이·치환 횟수(F17 §6.2).
import { describe, expect, test } from "bun:test";
import { CIRCULAR, REDACTED, Redactor, TOO_DEEP } from "@pf/observability";

// 17:702 의 거부목록 15개 — 키 하나를 목록에서 빼면 해당 행이 빨강이 된다.
const DENY_KEYS = [
	"authorization",
	"cookie",
	"set-cookie",
	"token",
	"access_token",
	"secret",
	"password",
	"client_secret",
	"x-forwarded-for",
	"x-real-ip",
	"cf-connecting-ip",
	"body",
	"payload",
	"displayName",
	"display_name",
] as const;

describe("키 거부목록", () => {
	test.each(DENY_KEYS)("%s 의 값은 센티널이 있어도 가려진다", (key) => {
		const out = new Redactor().redact({ [key]: "SENTINEL-value", keep: "ok" });
		expect(out).toEqual({ [key]: REDACTED, keep: "ok" });
	});

	test.each(["AUTHORIZATION", "Set-Cookie", "DISPLAYNAME", "Display_Name"])(
		"대소문자를 무시한다: %s",
		(key) => {
			expect(new Redactor().redact({ [key]: "x" })).toEqual({
				[key]: REDACTED,
			});
		},
	);

	test("값의 타입과 무관하게 가린다(객체·배열·숫자)", () => {
		const out = new Redactor().redact({
			body: { text: "SENTINEL" },
			token: ["a", "b"],
			password: 12345,
		});
		expect(out).toEqual({
			body: REDACTED,
			token: REDACTED,
			password: REDACTED,
		});
	});

	test("키 이름 전체가 같을 때만 건다 — 부분 일치는 거르지 않는다", () => {
		const out = new Redactor().redact({ tokenCount: 3, bodyLength: 10 });
		expect(out).toEqual({ tokenCount: 3, bodyLength: 10 });
	});

	test("중첩 객체와 배열 안에서도 건다", () => {
		const out = new Redactor().redact({
			req: { headers: { Authorization: "Bearer x" } },
			list: [{ cookie: "sid=1" }, { fine: 1 }],
		});
		expect(out).toEqual({
			req: { headers: { Authorization: REDACTED } },
			list: [{ cookie: REDACTED }, { fine: 1 }],
		});
	});
});

describe("값 패턴", () => {
	const SENTINELS: readonly (readonly [string, string])[] = [
		["Bearer", "Authorization 은 Bearer abc123.def-456_ghi 로 왔다"],
		[
			"32바이트 이상 base64url",
			"토큰 AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfG 확인",
		],
		["연결 문자열", "접속 postgres://admin:hunter2@db.internal:5432/pf 실패"],
		["IPv4", "client 203.0.113.42 요청"],
		["IPv6", "client 2001:db8:85a3::8a2e:370:7334 요청"],
	];

	test.each(SENTINELS)("%s 는 일치한 부분이 가려진다", (_name, text) => {
		const out = new Redactor().redact({ note: text });
		expect(out).toEqual({ note: expect.stringContaining(REDACTED) });
		const serialized = JSON.stringify(out);
		for (const secret of [
			"abc123.def-456_ghi",
			"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfG",
			"hunter2",
			"db.internal",
			"203.0.113.42",
			"2001:db8:85a3::8a2e:370:7334",
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	test("일치하지 않는 문맥은 남긴다", () => {
		const out = new Redactor().redact({ note: "client 203.0.113.42 요청" });
		expect(out).toEqual({ note: `client ${REDACTED} 요청` });
	});

	test("압축 IPv6 의 짧은 형태(::1)도 가린다", () => {
		expect(new Redactor().redact({ note: "bind ::1 ok" })).toEqual({
			note: `bind ${REDACTED} ok`,
		});
	});

	test("IP 가 아닌 것은 건드리지 않는다 — uuid·시각·버전·옥텟 범위 밖", () => {
		const text =
			"id 0192f3a4-7b1c-7def-8123-456789abcdef at 12:34:56 v1.2.3 ver 999.1.1.1";
		expect(new Redactor().redact({ note: text })).toEqual({ note: text });
	});

	test("42자 토큰은 가리지 않고 43자부터 가린다(32바이트 base64url 경계)", () => {
		const forty2 = "A".repeat(42);
		const forty3 = "A".repeat(43);
		expect(new Redactor().redact({ n: forty2 })).toEqual({ n: forty2 });
		expect(new Redactor().redact({ n: forty3 })).toEqual({ n: REDACTED });
	});
});

describe("구조 처리", () => {
	test("순환 참조는 [circular] 로 끊는다", () => {
		const loop: Record<string, unknown> = { name: "a" };
		loop.self = loop;
		expect(new Redactor().redact(loop)).toEqual({
			name: "a",
			self: CIRCULAR,
		});
	});

	test("같은 객체를 두 곳에서 참조하는 것은 순환이 아니다", () => {
		const shared = { v: 1 };
		expect(new Redactor().redact({ a: shared, b: shared })).toEqual({
			a: { v: 1 },
			b: { v: 1 },
		});
	});

	test("깊이 8 까지는 내려가고 9 부터 [depth] 다", () => {
		// 루트가 깊이 0 이고 value 까지 포함해 컨테이너가 9겹이면 가장 안쪽이 깊이 8 이다.
		let eight: unknown = { leaf: "ok" };
		for (let level = 0; level < 8; level += 1) {
			eight = { next: eight };
		}
		const nine = { next: eight };
		const out = JSON.stringify(new Redactor().redact(eight));
		expect(out).toContain('"leaf":"ok"');
		expect(JSON.stringify(new Redactor().redact(nine))).toContain(TOO_DEEP);
	});

	test("원본을 바꾸지 않는다", () => {
		const input = { password: "p", nested: { token: "t" } };
		new Redactor().redact(input);
		expect(input).toEqual({ password: "p", nested: { token: "t" } });
	});

	test("Error 는 이름과 메시지만 남기고 스택을 싣지 않는다", () => {
		const out = new Redactor().redact({ err: new Error("실패 203.0.113.9") });
		expect(out).toEqual({
			err: { name: "Error", message: `실패 ${REDACTED}` },
		});
	});

	test("Date 는 ISO 문자열이고 bigint 는 문자열이며 함수·undefined 는 빠진다", () => {
		const out = new Redactor().redact({
			at: new Date("2026-01-02T03:04:05.006Z"),
			big: 10n,
			fn: () => 1,
			nothing: undefined,
		});
		expect(JSON.stringify(out)).toBe(
			'{"at":"2026-01-02T03:04:05.006Z","big":"10"}',
		);
	});

	test("__proto__ 키가 프로토타입을 오염시키지 않는다", () => {
		const input = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
		const out = new Redactor().redact(input) as Record<string, unknown>;
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(out.a).toBe(1);
	});
});

describe("치환 횟수", () => {
	test("키 거부와 값 패턴 일치를 센다 — 깨끗한 입력은 0 이다", () => {
		const redactor = new Redactor();
		redactor.redact({ ok: "fine", n: 1 });
		expect(redactor.redactionCount()).toBe(0);
		redactor.redact({ password: "x", note: "ip 203.0.113.1 and 203.0.113.2" });
		expect(redactor.redactionCount()).toBe(3);
	});
});
