// 로더·원천 결합 시험 — 해석 정책(빈 값·_FILE·끝 개행·실패 분류)과 규칙·요약·종료 코드.
// 파일은 읽지 않는다: FileBackedEnvSource 에 가짜 안쪽 원천(MapEnvSource)과 가짜 읽기 함수를 넣는다(L2).
// 센티널은 시험 실행 중에 만든다. 소스에 리터럴로 두면 안 된다(오류 출력이 소스 줄을 찍는다).
import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import {
	baseSchema,
	defineSchema,
	exitCodeFor,
	FileBackedEnvSource,
	field,
	loadConfig,
	MapEnvSource,
	SecretString,
	summarize,
} from "@pf/config";
import { ConfigError } from "@pf/kernel";
import { apiLike, workerLike } from "./fixtures/sample-schemas.ts";

type ReadFile = NonNullable<
	ConstructorParameters<typeof FileBackedEnvSource>[1]
>;
type FakeFile = string | "ENOENT" | "EACCES";

// 경로 → 내용을 돌려주는 가짜 읽기. 호출 횟수를 센다.
function fakeFiles(files: Readonly<Record<string, FakeFile>>) {
	const calls: string[] = [];
	const read: ReadFile = (path) => {
		calls.push(path);
		const file = files[path];
		if (file === undefined || file === "ENOENT") {
			return { ok: false, reason: "file_not_found" };
		}
		if (file === "EACCES") {
			return { ok: false, reason: "file_unreadable" };
		}
		return { ok: true, text: file };
	};
	return { read, calls };
}

function sourceOf(
	env: Readonly<Record<string, string>>,
	files: Readonly<Record<string, FakeFile>> = {},
) {
	const fake = fakeFiles(files);
	return {
		source: new FileBackedEnvSource(new MapEnvSource(env), fake.read),
		calls: fake.calls,
	};
}

const sentinel = crypto.randomUUID();

// 필수 필드를 모두 채운 api 형 환경.
const apiEnv = {
	PUBLIC_ORIGIN: "http://localhost:8080",
	GITHUB_CLIENT_SECRET: "client-secret",
	OAUTH_STATE_SECRET: "o".repeat(32),
	ADMIN_GITHUB_IDS: "1,2",
};

describe("L1 필수 누락", () => {
	test("선언 순서로 missing 에 나오고 값이 어디에도 실리지 않는다", () => {
		const { source } = sourceOf({ OAUTH_STATE_SECRET: sentinel });
		const result = loadConfig(apiLike, source);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.details).toEqual({
			missing: ["PUBLIC_ORIGIN", "GITHUB_CLIENT_SECRET", "ADMIN_GITHUB_IDS"],
			invalid: [],
			violations: [],
		});
		for (const text of [
			JSON.stringify(result.error),
			Bun.inspect(result.error),
			inspect(result.error),
			result.error.message,
		]) {
			expect(text).not.toContain(sentinel);
		}
	});
});

describe("L2 빈 문자열은 없음", () => {
	test("필수 필드의 빈 값은 missing", () => {
		const { source } = sourceOf({ ...apiEnv, PUBLIC_ORIGIN: "" });
		const result = loadConfig(apiLike, source);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: ["PUBLIC_ORIGIN"],
				invalid: [],
				violations: [],
			});
		}
	});

	test("기본값이 있는 필드의 빈 값은 기본값", () => {
		const { source } = sourceOf({ LOG_LEVEL: "", APP_ENV: "" });
		const result = loadConfig(baseSchema, source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.config.LOG_LEVEL).toBe("info");
			expect(result.value.config.APP_ENV).toBe("development");
		}
	});
});

describe("_FILE 해석", () => {
	const schema = defineSchema({ X: field.string({ default: "fallback" }) });
	const requiredSchema = defineSchema({ X: field.string() });

	test("L3 NAME_FILE 만 있으면 읽기 함수가 돌려준 값", () => {
		const { source, calls } = sourceOf(
			{ X_FILE: "/run/secrets/x" },
			{ "/run/secrets/x": "from-file" },
		);
		const result = loadConfig(schema, source);
		expect(result.ok && result.value.config.X).toBe("from-file");
		expect(calls).toEqual(["/run/secrets/x"]);
	});

	test("L4 둘 다 있으면 NAME 값 + 경고, 파일은 읽지 않는다", () => {
		const { source, calls } = sourceOf(
			{ X: "from-env", X_FILE: "/run/secrets/x" },
			{ "/run/secrets/x": "from-file" },
		);
		const result = loadConfig(schema, source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.config.X).toBe("from-env");
			expect(result.value.warnings).toEqual([
				{ name: "X", code: "name_and_file_both_set" },
			]);
		}
		expect(calls).toEqual([]);
	});

	test.each([
		["v\r\n", "v"],
		["v\n\n", "v"],
		["v\r\n\r\n", "v"],
		["a\nb\n", "a\nb"],
		[" v \n", " v "],
	])("L5 끝 개행 %p → %p", (text, expected) => {
		const { source } = sourceOf({ X_FILE: "/p" }, { "/p": text });
		const result = loadConfig(schema, source);
		expect(result.ok && result.value.config.X).toBe(expected);
	});

	test.each([
		["﻿secret", "secret"],
		["﻿secret\r\n", "secret"],
		["﻿﻿secret", "﻿secret"],
	])("L5 맨 앞 BOM 은 한 개만 벗긴다 %p → %p", (text, expected) => {
		const { source } = sourceOf({ X_FILE: "/p" }, { "/p": text });
		const result = loadConfig(schema, source);
		expect(result.ok && result.value.config.X).toBe(expected);
	});

	test.each([
		["ENOENT", "file_not_found"],
		["EACCES", "file_unreadable"],
	] as const)(
		"L6 읽기 실패 %p 는 invalid %p — 기본값으로 가지 않는다",
		(file, reason) => {
			const { source } = sourceOf({ X_FILE: "/p" }, { "/p": file });
			const result = loadConfig(schema, source);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.details).toEqual({
					missing: [],
					invalid: [{ name: "X", reason }],
					violations: [],
				});
			}
		},
	);

	test.each(["", "\n", "\r\n\r\n", "﻿", "﻿\r\n"])(
		"L7 내용이 비었거나 개행뿐이면 file_empty (%p)",
		(text) => {
			const { source } = sourceOf({ X_FILE: "/p" }, { "/p": text });
			const result = loadConfig(schema, source);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.details).toEqual({
					missing: [],
					invalid: [{ name: "X", reason: "file_empty" }],
					violations: [],
				});
			}
		},
	);

	test("L8 NAME_FILE 가 빈 문자열이면 없음 — 기본값 또는 missing", () => {
		const withDefault = sourceOf({ X_FILE: "" });
		const first = loadConfig(schema, withDefault.source);
		expect(first.ok && first.value.config.X).toBe("fallback");
		expect(withDefault.calls).toEqual([]);

		const required = sourceOf({ X_FILE: "" });
		const second = loadConfig(requiredSchema, required.source);
		expect(second.ok).toBe(false);
		if (!second.ok) {
			expect(second.error.details).toEqual({
				missing: ["X"],
				invalid: [],
				violations: [],
			});
		}
	});
});

describe("L9 형식 오류", () => {
	test("잘못된 비밀 URL 은 not_url 이고 어떤 직렬화에도 값이 없다", () => {
		const { source } = sourceOf({ DATABASE_URL: `::${sentinel}` });
		const result = loadConfig(workerLike, source);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.details).toEqual({
			missing: [],
			invalid: [{ name: "DATABASE_URL", reason: "not_url" }],
			violations: [],
		});
		for (const text of [
			JSON.stringify(result.error),
			Bun.inspect(result.error),
			inspect(result.error),
			result.error.message,
		]) {
			expect(text).not.toContain(sentinel);
		}
	});
});

describe("L10 비밀 값", () => {
	test("비밀 필드는 SecretString 이고 reveal() 이 원값이다", () => {
		const { source } = sourceOf({ DATABASE_URL: "postgres://u:p@h:5432/db" });
		const result = loadConfig(workerLike, source);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const url = result.value.config.DATABASE_URL;
			expect(url).toBeInstanceOf(SecretString);
			expect(url.reveal()).toBe("postgres://u:p@h:5432/db");
		}
	});
});

describe("L11 교차 규칙", () => {
	test("필드 오류가 있으면 규칙 check 는 한 번도 호출되지 않는다", () => {
		let calls = 0;
		const schema = defineSchema({ A: field.int() }, [
			{
				id: "never_called",
				check: () => {
					calls += 1;
					return true;
				},
			},
		]);
		const result = loadConfig(schema, new MapEnvSource({}));
		expect(result.ok).toBe(false);
		expect(calls).toBe(0);
	});

	test.each([
		["15", true],
		["16", false],
	])(
		"handler_timeout_le_half_lease — 임대 30 이고 제한 %p 면 통과=%p",
		(timeout, passes) => {
			const { source } = sourceOf({
				DATABASE_URL: "postgres://h/db",
				LEASE_SECONDS: "30",
				HANDLER_TIMEOUT_SECONDS: timeout,
			});
			const result = loadConfig(workerLike, source);
			expect(result.ok).toBe(passes);
			if (!result.ok) {
				expect(result.error.details).toEqual({
					missing: [],
					invalid: [],
					violations: ["handler_timeout_le_half_lease"],
				});
			}
		},
	);

	test("production_cookie_secure — 운영에서 COOKIE_SECURE=false 면 위반", () => {
		const { source } = sourceOf({
			...apiEnv,
			APP_ENV: "production",
			COOKIE_SECURE: "false",
		});
		const result = loadConfig(apiLike, source);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: [],
				invalid: [],
				violations: ["production_cookie_secure"],
			});
		}
	});

	test("production_cookie_secure — 개발에서는 COOKIE_SECURE=false 가 통과", () => {
		const { source } = sourceOf({ ...apiEnv, COOKIE_SECURE: "false" });
		expect(loadConfig(apiLike, source).ok).toBe(true);
	});
});

describe("L12 불변", () => {
	test("설정 객체와 배열 값이 동결돼 있고 대입은 타입 오류다", () => {
		const { source } = sourceOf(apiEnv);
		const result = loadConfig(apiLike, source);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		const { config } = result.value;
		expect(Object.isFrozen(config)).toBe(true);
		expect(Object.isFrozen(config.ADMIN_GITHUB_IDS)).toBe(true);
		expect(config.ADMIN_GITHUB_IDS).toEqual([1, 2]);
		expect(() => {
			// @ts-expect-error 설정 속성은 읽기 전용이다
			config.LOG_LEVEL = "debug";
		}).toThrow();
	});
});

describe("L13 summarize", () => {
	test("비밀 아닌 값은 values, 비밀은 이름만 secretNames, undefined 는 건너뛴다", () => {
		const schema = defineSchema({
			PLAIN: field.int({ default: 7 }),
			LIST: field.csvInt(),
			SECRET: field.string({ secret: true }),
			MAYBE: field.int({ optional: true }),
		});
		const { source } = sourceOf({ LIST: "1,2", SECRET: sentinel });
		const result = loadConfig(schema, source);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		const summary = summarize(result.value.config);
		expect(summary).toEqual({
			values: { PLAIN: 7, LIST: [1, 2] },
			secretNames: ["SECRET"],
		});
		expect(JSON.stringify(summary)).not.toContain(sentinel);
		// ConfigOf 가 optional 필드를 `V | undefined` 로 운반한다.
		const maybe: number | undefined = result.value.config.MAYBE;
		expect(maybe).toBeUndefined();
		// @ts-expect-error optional 필드는 undefined 일 수 있어 number 에 대입되지 않는다
		const definite: number = result.value.config.MAYBE;
		expect(definite).toBeUndefined();
	});
});

describe("L14 독립성", () => {
	test("각 스키마는 자기 필수만 요구한다", () => {
		const worker = loadConfig(
			workerLike,
			sourceOf({ DATABASE_URL: "postgres://h/db" }).source,
		);
		expect(worker.ok).toBe(true);
		const api = loadConfig(apiLike, sourceOf(apiEnv).source);
		expect(api.ok).toBe(true);
	});

	test("빈 환경이면 각자 자기 필수 이름만 missing", () => {
		const worker = loadConfig(workerLike, sourceOf({}).source);
		const api = loadConfig(apiLike, sourceOf({}).source);
		expect(!worker.ok && worker.error.details).toEqual({
			missing: ["DATABASE_URL"],
			invalid: [],
			violations: [],
		});
		expect(!api.ok && api.error.details).toEqual({
			missing: [
				"PUBLIC_ORIGIN",
				"GITHUB_CLIENT_SECRET",
				"OAUTH_STATE_SECRET",
				"ADMIN_GITHUB_IDS",
			],
			invalid: [],
			violations: [],
		});
	});
});

describe("L15 오류 모양 · L16 종료 코드", () => {
	test("kernel ConfigError 그대로이고 cause 가 없다", () => {
		const result = loadConfig(workerLike, sourceOf({}).source);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error).toBeInstanceOf(ConfigError);
		expect(result.error.name).toBe("ConfigError");
		expect(result.error.code).toBe("config_invalid");
		expect(result.error.message).toBe("config_invalid");
		expect("cause" in result.error).toBe(false);
		// 운영자가 stderr 에서 보는 직렬화에도 details 가 있다.
		expect(JSON.parse(JSON.stringify(result.error))).toMatchObject({
			details: { missing: ["DATABASE_URL"] },
		});
	});

	test("exitCodeFor 는 78", () => {
		const result = loadConfig(workerLike, sourceOf({}).source);
		expect(!result.ok && exitCodeFor(result.error)).toBe(78);
	});
});

describe("L17 base", () => {
	test("APP_ENV 가 없으면 development", () => {
		const result = loadConfig(baseSchema, sourceOf({}).source);
		expect(result.ok && result.value.config.APP_ENV).toBe("development");
		if (result.ok) {
			// 값 타입이 values 의 리터럴 합이다 — string 으로 넓어졌다면 이 대입이 타입 오류다.
			const env: "development" | "test" | "production" =
				result.value.config.APP_ENV;
			expect(env).toBe("development");
		}
	});

	test("APP_ENV=staging 은 not_enum", () => {
		const result = loadConfig(
			baseSchema,
			sourceOf({ APP_ENV: "staging" }).source,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: [],
				invalid: [{ name: "APP_ENV", reason: "not_enum" }],
				violations: [],
			});
		}
	});
});
