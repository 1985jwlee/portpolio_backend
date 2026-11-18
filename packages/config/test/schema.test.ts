// 스키마 병합 시험 — 같은 정의의 공유는 허용하고 다른 정의의 충돌은 정의 시점에 막는다(D18).
import { describe, expect, test } from "bun:test";
import {
	defineSchema,
	field,
	fields,
	loadConfig,
	MapEnvSource,
	mergeSchemas,
	SecretString,
} from "@pf/config";

describe("mergeSchemas", () => {
	test("같은 명세 객체를 양쪽이 가지면 하나로 합쳐진다", () => {
		const a = defineSchema({ DATABASE_URL: fields.DATABASE_URL });
		const b = defineSchema({
			DATABASE_URL: fields.DATABASE_URL,
			PUBLIC_ORIGIN: fields.PUBLIC_ORIGIN,
		});
		const merged = mergeSchemas(a, b);
		expect(Object.keys(merged.fields)).toEqual([
			"DATABASE_URL",
			"PUBLIC_ORIGIN",
		]);
	});

	test("다른 명세가 같은 이름이면 던지고 메시지에 그 이름이 있다", () => {
		const a = defineSchema({ LEASE_SECONDS: field.int({ default: 30 }) });
		const b = defineSchema({ LEASE_SECONDS: field.int({ default: 30 }) });
		expect(() => mergeSchemas(a, b)).toThrow("LEASE_SECONDS");
	});

	test("키 순서는 a 다음 b 이고 규칙은 양쪽 다 순서대로 남는다", () => {
		const a = defineSchema({ A: field.int({ default: 1 }) }, [
			{ id: "rule_a", check: () => true },
		]);
		const b = defineSchema({ B: field.int({ default: 2 }) }, [
			{ id: "rule_b", check: () => true },
		]);
		const merged = mergeSchemas(a, b);
		expect(Object.keys(merged.fields)).toEqual(["A", "B"]);
		expect(merged.rules.map((rule) => rule.id)).toEqual(["rule_a", "rule_b"]);
	});

	test("병합 결과의 규칙이 로더에서 모두 돈다", () => {
		const a = defineSchema({ A: field.int({ default: 1 }) }, [
			{ id: "rule_a", check: () => false },
		]);
		const b = defineSchema({ B: field.int({ default: 2 }) }, [
			{ id: "rule_b", check: () => false },
		]);
		const result = loadConfig(mergeSchemas(a, b), new MapEnvSource({}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: [],
				invalid: [],
				violations: ["rule_a", "rule_b"],
			});
		}
	});
});

describe("mergeSchemas 교차 규칙(세 번째 인자)", () => {
	// 규칙은 양쪽 조각의 키를 함께 읽는다 — 어느 한 조각의 defineSchema 에는 둘 수 없다.
	const mode = defineSchema(
		{ MODE: field.oneOf(["dev", "prod"], { default: "dev" }) },
		[{ id: "rule_a", check: (config) => config.MODE !== "prod" }],
	);
	const cookie = defineSchema({ SECURE: field.bool({ default: false }) });
	const merged = mergeSchemas(mode, cookie, [
		{ id: "cross", check: (config) => config.MODE !== "prod" || config.SECURE },
	]);

	test("규칙 순서는 a 의 규칙, b 의 규칙, 교차 규칙이다", () => {
		expect(merged.rules.map((rule) => rule.id)).toEqual(["rule_a", "cross"]);
	});

	test("교차 규칙이 양쪽 키를 함께 읽는다 — 우회에서는 조용히 버려지던 a 의 규칙도 함께 돈다", () => {
		const dev = loadConfig(merged, new MapEnvSource({}));
		expect(dev.ok).toBe(true);
		const prod = loadConfig(merged, new MapEnvSource({ MODE: "prod" }));
		expect(prod.ok).toBe(false);
		if (!prod.ok) {
			// a 의 규칙(rule_a)과 교차 규칙(cross)이 모두 위반으로 나온다.
			expect(prod.error.details).toEqual({
				missing: [],
				invalid: [],
				violations: ["rule_a", "cross"],
			});
		}
		// 필드를 펼쳐 새로 정의하는 우회는 a 의 규칙을 옮기지 않는다 — 그 차이가 이 시험이 잡는 것이다.
		const bypass = defineSchema({ ...mode.fields, ...cookie.fields }, [
			{
				id: "cross",
				check: (config) => config.MODE !== "prod" || config.SECURE,
			},
		]);
		const bypassed = loadConfig(bypass, new MapEnvSource({ MODE: "prod" }));
		expect(bypassed.ok).toBe(false);
		if (!bypassed.ok) {
			expect(bypassed.error.details).toEqual({
				missing: [],
				invalid: [],
				violations: ["cross"],
			});
		}
	});

	test("교차 규칙이 통과하면 로드된다", () => {
		const result = loadConfig(
			mergeSchemas(mode, cookie, [
				{ id: "cross", check: (config) => config.SECURE },
			]),
			new MapEnvSource({ SECURE: "true" }),
		);
		expect(result.ok).toBe(true);
	});

	test("세 번째 인자를 생략하면 지금까지처럼 조각의 규칙만 남는다", () => {
		expect(mergeSchemas(mode, cookie).rules.map((rule) => rule.id)).toEqual([
			"rule_a",
		]);
	});
});

describe("field 비밀 조합", () => {
	test("변수로 넘긴 옵션이어도 비밀 필드의 기본값은 정의 시점에 던진다(타입은 리터럴만 막는다)", () => {
		const options: { readonly secret: true; readonly default: string } = {
			secret: true,
			default: "x",
		};
		expect(() => field.string(options)).toThrow(
			"비밀 필드는 기본값을 가질 수 없다",
		);
		expect(() => field.url(options)).toThrow(
			"비밀 필드는 기본값을 가질 수 없다",
		);
	});

	test("문자열이 아닌 필드를 변수로 비밀 지정해도 정의 시점에 던진다", () => {
		const options: { readonly secret: true; readonly optional: true } = {
			secret: true,
			optional: true,
		};
		expect(() => field.int(options)).toThrow("url·string 만 가능하다");
		expect(() => field.bool(options)).toThrow("url·string 만 가능하다");
		expect(() => field.oneOf(["a"], options)).toThrow("url·string 만 가능하다");
	});

	test("비밀 가드의 오류 문구는 내부 kind 가 아니라 공개 생성 함수 이름을 찍는다", () => {
		const options: { readonly secret: true; readonly optional: true } = {
			secret: true,
			optional: true,
		};
		expect(() => field.oneOf(["a"], options)).toThrow(
			"field.oneOf: 비밀 필드는 url·string 만 가능하다",
		);
		expect(() => field.csvInt(options)).toThrow(
			"field.csvInt: 비밀 필드는 url·string 만 가능하다",
		);
		// 기본값 가드(schema.ts 의 첫 throw)도 같은 이름을 찍는다. csvInt 는 default 오버로드가 없어 oneOf 로 건다.
		const withDefault: { readonly secret: true; readonly default: "a" } = {
			secret: true,
			default: "a",
		};
		expect(() => field.oneOf(["a"], withDefault)).toThrow(
			"field.oneOf: 비밀 필드는 기본값을 가질 수 없다",
		);
	});

	test("secret + optional 은 값이 없으면 undefined 이고 있으면 SecretString 이다", () => {
		const schema = defineSchema({
			KEY: field.string({ secret: true, optional: true }),
			LINK: field.url({ secret: true, optional: true }),
		});
		const absent = loadConfig(schema, new MapEnvSource({}));
		expect(absent.ok).toBe(true);
		if (absent.ok) {
			expect(absent.value.config.KEY).toBeUndefined();
			expect(absent.value.config.LINK).toBeUndefined();
		}
		const present = loadConfig(
			schema,
			new MapEnvSource({ KEY: "k", LINK: "http://h" }),
		);
		expect(present.ok).toBe(true);
		if (present.ok) {
			const key: SecretString | undefined = present.value.config.KEY;
			const link: SecretString | undefined = present.value.config.LINK;
			expect(key).toBeInstanceOf(SecretString);
			expect(link).toBeInstanceOf(SecretString);
			// @ts-expect-error optional 비밀은 undefined 일 수 있어 SecretString 에 대입되지 않는다
			const required: SecretString = present.value.config.KEY;
			expect(required).toBeInstanceOf(SecretString);
		}
	});

	test("secret + optional 을 변수로 넘겨도 SecretString | undefined 로 추론된다(오버로드 순서)", () => {
		const options: { readonly secret: true; readonly optional: true } = {
			secret: true,
			optional: true,
		};
		const schema = defineSchema({ KEY: field.string(options) });
		const result = loadConfig(schema, new MapEnvSource({ KEY: "k" }));
		expect(result.ok).toBe(true);
		if (result.ok) {
			const key: SecretString | undefined = result.value.config.KEY;
			expect(key).toBeInstanceOf(SecretString);
		}
	});
});

describe("field.oneOf 타입", () => {
	test("default 는 values 에 속해야 한다", () => {
		// @ts-expect-error "z" 는 values 에 없다
		const spec = field.oneOf(["a", "b"], { default: "z" });
		expect(spec.presence).toBe("default");
	});
});
