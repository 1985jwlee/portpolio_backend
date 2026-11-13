import { defineConfig } from "drizzle-kit";

// 모듈이 자기 설정·스키마·마이그레이션 폴더를 소유한다(ADR-052 결정 7). 저장소 루트(이 스파이크 폴더)에서 --config 로 실행한다.
export default defineConfig({
  dialect: "postgresql",
  schema: "./modules/beta/src/schema.ts",
  out: "./modules/beta/migrations",
  schemaFilter: ["beta"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:pw@127.0.0.1:35435/postgres" },
});
