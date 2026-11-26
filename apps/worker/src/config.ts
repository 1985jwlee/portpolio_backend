// worker 의 설정 스키마 — 공통(APP_ENV·LOG_LEVEL) + DATABASE_URL + worker 전용 키.
// 키의 정본은 docs/design/01-repository-structure.md §8 이다. 잡·재시도 관련 키는 그것을 쓰는 행이 더한다.
import {
	baseSchema,
	type ConfigOf,
	defineSchema,
	field,
	fields,
	mergeSchemas,
} from "@pf/config";

export const workerSchema = mergeSchemas(
	baseSchema,
	defineSchema({
		DATABASE_URL: fields.DATABASE_URL,
		WORKER_PORT: field.int({ default: 3003 }),
	}),
);

export type WorkerConfig = ConfigOf<typeof workerSchema>;
