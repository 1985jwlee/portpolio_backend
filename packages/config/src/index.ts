// 공개 표면 — 이 파일이 config 가 내보내는 이름의 유일한 목록이다. `export *` 를 쓰지 않는다.

export type {
	ConfigErrorDetails,
	LoadWarning,
} from "./loader.ts";
export { exitCodeFor, loadConfig, summarize } from "./loader.ts";
export type { ConfigOf, ConfigSchema, FieldSpec } from "./schema.ts";
export { defineSchema, field, mergeSchemas } from "./schema.ts";
export type { BaseConfig } from "./schemas/base.ts";
export { baseSchema } from "./schemas/base.ts";
export { fields } from "./schemas/fields.ts";
export { SecretString } from "./secret-string.ts";
export type { EnvLookup } from "./sources.ts";
export {
	FileBackedEnvSource,
	MapEnvSource,
	ProcessEnvSource,
} from "./sources.ts";
