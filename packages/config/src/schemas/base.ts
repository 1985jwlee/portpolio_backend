// 모든 앱이 공통으로 갖는 키만 둔다(01 §8.1 의 "공통" 표 가운데 앱 열이 전부 해당하는 것은 APP_ENV·LOG_LEVEL 뿐이다).
import type { ConfigOf } from "../schema.ts";
import { defineSchema, field } from "../schema.ts";

export const baseSchema = defineSchema({
	APP_ENV: field.oneOf(["development", "test", "production"], {
		default: "development",
	}),
	LOG_LEVEL: field.oneOf(["debug", "info", "warn", "error"], {
		default: "info",
	}),
});

export type BaseConfig = ConfigOf<typeof baseSchema>;
