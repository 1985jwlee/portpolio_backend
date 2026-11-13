// G10b — 모듈 하나의 마이그레이션을 런타임 마이그레이터로 적용한다. 작성: AI 초안 (Authorship: G).
// 환경: DATABASE_URL, MODULE(모듈 이름), MIGRATIONS(그 모듈의 마이그레이션 폴더), SHARED=1(관찰용: 기본 이력 표를 모듈이 공유)
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const client = new Bun.SQL(process.env.DATABASE_URL!);
const db = drizzle(client);
const config = process.env.SHARED === "1"
  ? { migrationsFolder: process.env.MIGRATIONS! }
  : { migrationsFolder: process.env.MIGRATIONS!, migrationsSchema: "pf_migrations", migrationsTable: process.env.MODULE! };
await migrate(db, config);
await client.close();
console.log("migrated", process.env.MODULE);
