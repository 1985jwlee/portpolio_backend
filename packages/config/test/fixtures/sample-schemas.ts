// 시험 전용 샘플 스키마 둘 — 실제 앱 스키마가 아니다(앱 스키마는 각 앱 단계가 만든다).
// 둘이 서로 다른 필수 필드를 갖는다 — 그래야 "타 앱 변수를 요구하지 않음" 시험이 뜻을 갖는다.
import {
	baseSchema,
	defineSchema,
	field,
	fields,
	mergeSchemas,
} from "@pf/config";

// 워커형: DATABASE_URL 이 필수이고, 처리 제한 시간은 임대 시간의 절반 이하여야 한다.
export const workerLike = mergeSchemas(
	baseSchema,
	defineSchema(
		{
			DATABASE_URL: fields.DATABASE_URL,
			LEASE_SECONDS: field.int({ default: 30 }),
			HANDLER_TIMEOUT_SECONDS: field.int({ default: 10 }),
		},
		[
			{
				id: "handler_timeout_le_half_lease",
				check: (config) =>
					config.HANDLER_TIMEOUT_SECONDS * 2 <= config.LEASE_SECONDS,
			},
		],
	),
);

// API 형: 공개 출처·OAuth 비밀·관리자 목록이 필수이고, 운영에서는 쿠키가 보안 설정이어야 한다.
// 규칙이 APP_ENV(base)와 COOKIE_SECURE(api 조각)를 함께 읽으므로 병합 뒤 교차 규칙으로 mergeSchemas 의 세 번째 인자에 둔다.
export const apiLike = mergeSchemas(
	baseSchema,
	defineSchema({
		PUBLIC_ORIGIN: fields.PUBLIC_ORIGIN,
		GITHUB_CLIENT_SECRET: fields.GITHUB_CLIENT_SECRET,
		OAUTH_STATE_SECRET: fields.OAUTH_STATE_SECRET,
		ADMIN_GITHUB_IDS: fields.ADMIN_GITHUB_IDS,
		SESSION_COOKIE_NAME: fields.SESSION_COOKIE_NAME,
		COOKIE_SECURE: fields.COOKIE_SECURE,
	}),
	[
		{
			id: "production_cookie_secure",
			check: (config) =>
				config.APP_ENV !== "production" ||
				(config.COOKIE_SECURE &&
					config.SESSION_COOKIE_NAME.startsWith("__Host-")),
		},
	],
);
