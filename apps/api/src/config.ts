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
		// 종료 신호 뒤 readyz 503 으로 새 트래픽이 빠지길 기다리는 시간(ms). 0 이면 기다리지 않는다 — 로드밸런서 확인 주기를 측정한 뒤 정한다(DV-036).
		DRAIN_DELAY_MS: field.int({ default: 0 }),
	}),
);

export type ApiConfig = ConfigOf<typeof apiSchema>;
