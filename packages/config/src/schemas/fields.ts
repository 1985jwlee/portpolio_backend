// 여러 앱이 골라 쓰는 공유 필드 정의 — 키는 환경변수 이름 그대로다(정본: docs/design/01-repository-structure.md §8).
// 정의가 한 곳이라 앱별 사본의 기본값이 갈리지 않는다. 앱 스키마 자체는 각 앱 단계가 만든다.
import { field } from "../schema.ts";

export const fields = Object.freeze({
	DATABASE_URL: field.url({ secret: true }),
	PUBLIC_ORIGIN: field.url(),
	SESSION_COOKIE_NAME: field.string({ default: "__Host-sid" }),
	COOKIE_SECURE: field.bool({ default: true }),
	GITHUB_CLIENT_ID: field.string(),
	GITHUB_CLIENT_SECRET: field.string({ secret: true }),
	OAUTH_STATE_SECRET: field.string({ secret: true, minBytes: 32 }),
	ADMIN_GITHUB_IDS: field.csvInt(),
});
