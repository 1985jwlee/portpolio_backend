import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  schemaFilter: ["spike"], // 스키마 이름을 나열한다(‘*’ 불가 — tech-stack §11.1 G10 규칙 ⑤)
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:pw@127.0.0.1:35433/postgres" },
});
