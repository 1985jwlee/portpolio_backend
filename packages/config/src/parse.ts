// 원시 문자열 하나를 명세의 타입 값으로 바꾸거나 사유 코드를 낸다.
// 빈 값 판정·_FILE·비밀 감싸기는 이 파일의 책임이 아니다(loader.ts).
// 결과에 입력 문자열을 싣지 않는다 — 사유는 닫힌 코드뿐이다.
import type { FieldSpec } from "./schema.ts";

export type ParseFailure =
	| "not_int"
	| "not_bool"
	| "not_url"
	| "not_enum"
	| "not_csv_int"
	| "too_short";

export type ParseOutcome =
	| {
			readonly ok: true;
			readonly value: number | boolean | string | readonly number[];
	  }
	| { readonly ok: false; readonly reason: ParseFailure };

const INT_PATTERN = /^-?[0-9]+$/;

const encoder = new TextEncoder();

// Number()·parseInt 는 ""→0, " 12 "→12, "1e3"→1000, "0x10"→16 처럼 관대해서 쓰지 않는다.
function parseInteger(raw: string): number | undefined {
	if (!INT_PATTERN.test(raw)) {
		return undefined;
	}
	const value = Number(raw);
	return Number.isSafeInteger(value) ? value : undefined;
}

function fail(reason: ParseFailure): ParseOutcome {
	return { ok: false, reason };
}

function parseCsvInt(raw: string): ParseOutcome {
	const numbers: number[] = [];
	for (const piece of raw.split(",")) {
		const value = parseInteger(piece);
		if (value === undefined) {
			return fail("not_csv_int");
		}
		numbers.push(value);
	}
	return { ok: true, value: Object.freeze(numbers) };
}

function parseBool(raw: string): ParseOutcome {
	if (raw === "true" || raw === "1") {
		return { ok: true, value: true };
	}
	if (raw === "false" || raw === "0") {
		return { ok: true, value: false };
	}
	return fail("not_bool");
}

function parseString(spec: FieldSpec<unknown>, raw: string): ParseOutcome {
	// 바이트 기준이다 — 문자 수가 아니다("é"×16 은 16자·32바이트).
	if (
		spec.minBytes !== undefined &&
		encoder.encode(raw).length < spec.minBytes
	) {
		return fail("too_short");
	}
	return { ok: true, value: raw };
}

export function parseValue(
	spec: FieldSpec<unknown>,
	raw: string,
): ParseOutcome {
	switch (spec.kind) {
		case "int": {
			const value = parseInteger(raw);
			return value === undefined ? fail("not_int") : { ok: true, value };
		}
		case "bool":
			return parseBool(raw);
		case "url":
			// URL.canParse 는 관대하다(공백 섞인 경로도 통과). 더 조이지 않는다. URL 객체가 아니라 원래 문자열을 담는다.
			return URL.canParse(raw) ? { ok: true, value: raw } : fail("not_url");
		case "enum":
			return spec.values?.includes(raw) === true
				? { ok: true, value: raw }
				: fail("not_enum");
		case "csv-int":
			return parseCsvInt(raw);
		case "string":
			return parseString(spec, raw);
	}
}
