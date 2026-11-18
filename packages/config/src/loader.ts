// 해석 정책의 분류·수집(둘 다 있음 경고·읽기 실패와 빈 파일의 invalid 분류·오류 수집·규칙 실행)과 요약·종료 코드 매핑.
// 순서·빈 값·_FILE·끝 개행은 값 원천(sources.ts)이 끝낸 결과를 받는다. 아무것도 출력하지 않는다 — 경고와 오류를 값으로 돌려준다.
import { ConfigError, Result } from "@pf/kernel";
import type { ParseFailure } from "./parse.ts";
import { parseValue } from "./parse.ts";
import type { ConfigOf, ConfigSchema, FieldMap, FieldSpec } from "./schema.ts";
import { SecretString } from "./secret-string.ts";
import type { EnvSource } from "./sources.ts";

export type InvalidReason =
	| ParseFailure
	| "file_not_found"
	| "file_unreadable"
	| "file_empty";

export type ConfigErrorDetails = {
	readonly missing: readonly string[];
	readonly invalid: readonly {
		readonly name: string;
		readonly reason: InvalidReason;
	}[];
	readonly violations: readonly string[];
};

export type LoadWarning = {
	readonly name: string;
	readonly code: "name_and_file_both_set";
};

type SummaryValue = string | number | boolean | readonly number[];

type Loaded = {
	readonly config: Readonly<Record<string, unknown>>;
	readonly warnings: readonly LoadWarning[];
};

// sysexits EX_CONFIG. 다른 종료 코드(16 §9.8)는 앱 생명주기(S1-7)의 몫이다.
const EXIT_CONFIG = 78;

type FieldOutcome =
	| { readonly kind: "value"; readonly value: unknown }
	| { readonly kind: "missing" }
	| { readonly kind: "invalid"; readonly reason: InvalidReason };

function parseCandidate(spec: FieldSpec<unknown>, raw: string): FieldOutcome {
	const parsed = parseValue(spec, raw);
	if (!parsed.ok) {
		return { kind: "invalid", reason: parsed.reason };
	}
	// 비밀은 문자열 종류(url·string)뿐이다 — 값이 문자열일 때만 감싼다.
	if (spec.secret && typeof parsed.value === "string") {
		return { kind: "value", value: new SecretString(parsed.value) };
	}
	return { kind: "value", value: parsed.value };
}

// 값이 원천에 없을 때 — presence 로 분기한다(false·0 같은 기본값을 "없음"으로 오판하지 않는다).
function fallbackFor(spec: FieldSpec<unknown>): FieldOutcome {
	switch (spec.presence) {
		case "default":
			// 기본값은 변환하지 않고 그대로 쓴다.
			return { kind: "value", value: spec.defaultValue };
		case "optional":
			return { kind: "value", value: undefined };
		case "required":
			return { kind: "missing" };
	}
}

function isNumberArray(value: unknown): value is readonly number[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "number")
	);
}

function loadField(
	name: string,
	spec: FieldSpec<unknown>,
	source: EnvSource,
	warnings: LoadWarning[],
): FieldOutcome {
	const found = source.lookup(name);
	switch (found.kind) {
		case "env":
			// 둘 다 있으면 NAME 이 이긴다. 파일은 읽지 않았다.
			if (found.bothSet) {
				warnings.push({ name, code: "name_and_file_both_set" });
			}
			return parseCandidate(spec, found.value);
		case "file":
			// 읽기 실패·빈 파일은 기본값으로 가지 않는다 — 비밀 마운트가 빠진 기동이 조용히 성공하면 안 된다.
			if ("failure" in found) {
				return { kind: "invalid", reason: found.failure };
			}
			return found.value === ""
				? { kind: "invalid", reason: "file_empty" }
				: parseCandidate(spec, found.value);
		case "absent":
			return fallbackFor(spec);
	}
}

function evaluateRules(
	schema: ConfigSchema<FieldMap>,
	config: Readonly<Record<string, unknown>>,
): readonly string[] {
	const violations: string[] = [];
	for (const rule of schema.rules) {
		if (!rule.check(config)) {
			violations.push(rule.id);
		}
	}
	return violations;
}

function failure(details: ConfigErrorDetails): Result<Loaded, ConfigError> {
	// message·cause 를 주지 않는다 — 메시지는 config_invalid 고, 값이 어디에도 실리지 않는다.
	return Result.err(
		new ConfigError({
			details: Object.freeze({
				missing: Object.freeze([...details.missing]),
				invalid: Object.freeze(
					details.invalid.map((item) => Object.freeze({ ...item })),
				),
				violations: Object.freeze([...details.violations]),
			}),
		}),
	);
}

// 필드를 선언 순서로 한 번 돈다. 오류가 하나도 없을 때만 교차 규칙이 돈다 — 규칙은 타입이 확정된 값만 받는다.
export function loadConfig<S extends ConfigSchema<FieldMap>>(
	schema: S,
	source: EnvSource,
): Result<
	{ readonly config: ConfigOf<S>; readonly warnings: readonly LoadWarning[] },
	ConfigError
>;
export function loadConfig(
	schema: ConfigSchema<FieldMap>,
	source: EnvSource,
): Result<Loaded, ConfigError> {
	const missing: string[] = [];
	const invalid: { name: string; reason: InvalidReason }[] = [];
	const warnings: LoadWarning[] = [];
	const values: Record<string, unknown> = {};

	for (const [name, spec] of Object.entries(schema.fields)) {
		const outcome = loadField(name, spec, source, warnings);
		switch (outcome.kind) {
			case "value":
				values[name] = outcome.value;
				break;
			case "missing":
				missing.push(name);
				break;
			case "invalid":
				invalid.push({ name, reason: outcome.reason });
				break;
		}
	}

	if (missing.length > 0 || invalid.length > 0) {
		return failure({ missing, invalid, violations: [] });
	}

	const config = Object.freeze(values);
	const violations = evaluateRules(schema, config);
	if (violations.length > 0) {
		return failure({ missing: [], invalid: [], violations });
	}
	return Result.ok({ config, warnings: Object.freeze(warnings) });
}

function isSummaryValue(value: unknown): value is SummaryValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		isNumberArray(value)
	);
}

// 기동 로그용 요약 — 비밀은 값이 아니라 이름만 낸다. 비밀 여부는 값이 SecretString 인지로 가른다.
export function summarize(config: Readonly<Record<string, unknown>>): {
	readonly values: Readonly<Record<string, SummaryValue>>;
	readonly secretNames: readonly string[];
} {
	const values: Record<string, SummaryValue> = {};
	const secretNames: string[] = [];
	for (const [name, value] of Object.entries(config)) {
		if (value instanceof SecretString) {
			secretNames.push(name);
		} else if (isSummaryValue(value)) {
			values[name] = value;
		}
	}
	return Object.freeze({
		values: Object.freeze(values),
		secretNames: Object.freeze(secretNames),
	});
}

// 설정 오류에만 쓴다 — 인자와 무관하게 78 이다.
export function exitCodeFor(_error: ConfigError): number {
	return EXIT_CONFIG;
}
