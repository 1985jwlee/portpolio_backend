// api 의 설정 스키마 — 공통(APP_ENV·LOG_LEVEL) + 공유 필드 가운데 api 가 쓰는 것 + api 전용 키.
// 키의 정본은 docs/design/01-repository-structure.md §8 이다. 다른 키(OAuth·세션 등)는 그것을 쓰는 행이 더한다.
import {
	baseSchema,
	type ConfigOf,
	defineSchema,
	field,
	fields,
	mergeSchemas,
} from "@pf/config";

export const apiSchema = mergeSchemas(
	baseSchema,
	defineSchema({
		DATABASE_URL: fields.DATABASE_URL,
		API_PORT: field.int({ default: 3001 }),
	}),
);

export type ApiConfig = ConfigOf<typeof apiSchema>;
