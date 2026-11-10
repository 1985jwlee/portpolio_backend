// G10 스파이크 — 런타임 마이그레이터(설계의 db:migrate 가 쓸 경로). 작성: AI 초안 (Authorship: G).
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const client = new Bun.SQL(process.env.DATABASE_URL!);
const db = drizzle(client);
await migrate(db, { migrationsFolder: process.env.MIGRATIONS ?? "./drizzle" });
await client.close();
console.log("migrated");
