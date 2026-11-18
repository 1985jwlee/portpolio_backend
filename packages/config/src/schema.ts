// 필드 정의·스키마 정의·병합·교차 규칙의 데이터 모양과 타입 추론.
// 값을 읽거나 변환하지 않는다(그것은 sources.ts·parse.ts·loader.ts 의 몫이다).
import type { SecretString } from "./secret-string.ts";

export type FieldKind = "int" | "bool" | "url" | "enum" | "csv-int" | "string";
export type Presence = "required" | "default" | "optional";

// V 는 로드된 값의 타입, P 는 presence 의 리터럴이다. 둘 다 타입 추론을 운반할 뿐이다.
// ConfigOf 가 optional 필드를 `V | undefined` 로 가리려면 P 가 타입에도 있어야 한다.
export type FieldSpec<V, P extends Presence = Presence> = {
	readonly kind: FieldKind;
	readonly presence: P;
	readonly defaultValue?: V;
	readonly secret: boolean;
	readonly values?: readonly string[];
	readonly minBytes?: number;
};

export type FieldMap = Readonly<Record<string, FieldSpec<unknown>>>;

type ValueOf<S> =
	S extends FieldSpec<infer V, infer P>
		? P extends "optional"
			? V | undefined
			: V
		: never;

// 필드 묶음에서 읽기 전용 설정 객체 타입을 계산한다. 공개하지 않는다.
type ConfigOfFields<F extends FieldMap> = {
	readonly [K in keyof F]: ValueOf<F[K]>;
};

// 규칙 검사는 메서드 표기다 — 병합·로더가 넓은 설정 타입으로 다룰 때 매개변수를 양방향으로 비교하게 한다.
export type ConfigRule<C> = {
	readonly id: string;
	check(config: C): boolean;
};

export type ConfigSchema<F extends FieldMap> = {
	readonly fields: F;
	readonly rules: readonly ConfigRule<ConfigOfFields<F>>[];
};

export type ConfigOf<S> =
	S extends ConfigSchema<infer F> ? ConfigOfFields<F> : never;

// 생성 함수가 받는 선택 인자의 합집합(구현 시그니처용). 공개 시그니처는 아래 오버로드가 좁힌다.
type SpecOptions<V> = {
	readonly default?: V;
	readonly optional?: true;
	readonly secret?: true;
	readonly minBytes?: number;
	readonly values?: readonly string[];
};

// 오류 문구에 찍을 공개 생성 함수 이름. 내부 kind 는 oneOf·csvInt 와 다르다("enum"·"csv-int").
const PUBLIC_NAME: Readonly<Record<FieldKind, string>> = {
	int: "int",
	bool: "bool",
	url: "url",
	enum: "oneOf",
	"csv-int": "csvInt",
	string: "string",
};

function build<V>(
	kind: FieldKind,
	options: SpecOptions<V> | undefined,
): FieldSpec<V> {
	// 비밀의 조합 제한은 타입(오버로드)이 신선한 리터럴만 막으므로 런타임에서도 막는다.
	// 기본값은 summarize 에 평문으로 나가고, 문자열이 아닌 비밀은 SecretString 으로 감싸지지 않아 values 에 나간다.
	if (options?.secret === true) {
		if (options.default !== undefined) {
			throw new Error(
				`field.${PUBLIC_NAME[kind]}: 비밀 필드는 기본값을 가질 수 없다`,
			);
		}
		if (kind !== "url" && kind !== "string") {
			throw new Error(
				`field.${PUBLIC_NAME[kind]}: 비밀 필드는 url·string 만 가능하다`,
			);
		}
	}
	const hasDefault = options?.default !== undefined;
	const presence: Presence = hasDefault
		? "default"
		: options?.optional === true
			? "optional"
			: "required";
	// exactOptionalPropertyTypes — 값이 없는 선택 키는 아예 만들지 않는다.
	return Object.freeze({
		kind,
		presence,
		secret: options?.secret === true,
		...(options?.default !== undefined
			? { defaultValue: options.default }
			: {}),
		...(options?.values !== undefined ? { values: options.values } : {}),
		...(options?.minBytes !== undefined ? { minBytes: options.minBytes } : {}),
	});
}

function int(): FieldSpec<number, "required">;
function int(options: {
	readonly default: number;
}): FieldSpec<number, "default">;
function int(options: {
	readonly optional: true;
}): FieldSpec<number, "optional">;
function int(options?: SpecOptions<number>): FieldSpec<number> {
	return build("int", options);
}

function bool(): FieldSpec<boolean, "required">;
function bool(options: {
	readonly default: boolean;
}): FieldSpec<boolean, "default">;
function bool(options: {
	readonly optional: true;
}): FieldSpec<boolean, "optional">;
function bool(options?: SpecOptions<boolean>): FieldSpec<boolean> {
	return build("bool", options);
}

// secret + optional 은 맨 앞에 둔다 — 변수로 넘긴 { secret, optional } 이 { optional } 오버로드에 먼저 맞으면 SecretString 이 string 으로 추론된다.
function url(options: {
	readonly secret: true;
	readonly optional: true;
}): FieldSpec<SecretString, "optional">;
function url(): FieldSpec<string, "required">;
function url(options: {
	readonly default: string;
}): FieldSpec<string, "default">;
function url(options: {
	readonly optional: true;
}): FieldSpec<string, "optional">;
function url(options: {
	readonly secret: true;
}): FieldSpec<SecretString, "required">;
function url(options?: SpecOptions<string>): FieldSpec<string | SecretString> {
	return build("url", options);
}

// values 의 리터럴 합이 값 타입이 된다. default 는 그 합에 속해야 한다(NoInfer — default 가 합을 넓히지 못하게).
function oneOf<const V extends string>(
	values: readonly V[],
): FieldSpec<V, "required">;
function oneOf<const V extends string>(
	values: readonly V[],
	options: { readonly default: NoInfer<V> },
): FieldSpec<V, "default">;
function oneOf<const V extends string>(
	values: readonly V[],
	options: { readonly optional: true },
): FieldSpec<V, "optional">;
function oneOf(
	values: readonly string[],
	options?: SpecOptions<string>,
): FieldSpec<string> {
	return build("enum", { ...options, values });
}

function csvInt(): FieldSpec<readonly number[], "required">;
function csvInt(options: {
	readonly optional: true;
}): FieldSpec<readonly number[], "optional">;
function csvInt(options?: SpecOptions<never>): FieldSpec<readonly number[]> {
	return build("csv-int", options);
}

// secret + optional 은 맨 앞에 둔다(url 과 같은 이유).
function string(options: {
	readonly secret: true;
	readonly optional: true;
	readonly minBytes?: number;
}): FieldSpec<SecretString, "optional">;
function string(options?: {
	readonly minBytes?: number;
}): FieldSpec<string, "required">;
function string(options: {
	readonly default: string;
	readonly minBytes?: number;
}): FieldSpec<string, "default">;
function string(options: {
	readonly optional: true;
	readonly minBytes?: number;
}): FieldSpec<string, "optional">;
function string(options: {
	readonly secret: true;
	readonly minBytes?: number;
}): FieldSpec<SecretString, "required">;
function string(
	options?: SpecOptions<string>,
): FieldSpec<string | SecretString> {
	return build("string", options);
}

export const field = { int, bool, url, oneOf, csvInt, string };

// 키가 곧 환경변수 이름이다. 받은 묶음과 규칙을 동결해 돌려준다.
export function defineSchema<F extends FieldMap>(
	fields: F,
	rules?: readonly ConfigRule<ConfigOfFields<F>>[],
): ConfigSchema<F>;
export function defineSchema(
	fields: FieldMap,
	rules: readonly ConfigRule<ConfigOfFields<FieldMap>>[] = [],
): ConfigSchema<FieldMap> {
	return Object.freeze({
		fields: Object.freeze({ ...fields }),
		rules: Object.freeze([...rules]),
	});
}

// 같은 이름이 양쪽에 있으면 같은 명세 객체(참조 동일)일 때만 하나로 합친다.
// 다르면 프로그래머 오류라 던진다 — 설정 값 오류가 아니므로 Result 가 아니다.
// rules 는 병합 뒤 설정 전체를 보는 교차 규칙이다(양쪽 조각의 키를 함께 읽는 규칙은 어느 조각에도 둘 수 없다). 조각의 규칙 다음에 돈다.
export function mergeSchemas<A extends FieldMap, B extends FieldMap>(
	a: ConfigSchema<A>,
	b: ConfigSchema<B>,
	rules?: readonly ConfigRule<ConfigOfFields<A & B>>[],
): ConfigSchema<A & B>;
export function mergeSchemas(
	a: ConfigSchema<FieldMap>,
	b: ConfigSchema<FieldMap>,
	rules: readonly ConfigRule<ConfigOfFields<FieldMap>>[] = [],
): ConfigSchema<FieldMap> {
	const merged: Record<string, FieldSpec<unknown>> = { ...a.fields };
	for (const [name, spec] of Object.entries(b.fields)) {
		const existing = merged[name];
		if (existing !== undefined && existing !== spec) {
			throw new Error(`mergeSchemas: 서로 다른 정의로 겹치는 필드 ${name}`);
		}
		merged[name] = spec;
	}
	return Object.freeze({
		fields: Object.freeze(merged),
		rules: Object.freeze([...a.rules, ...b.rules, ...rules]),
	});
}
