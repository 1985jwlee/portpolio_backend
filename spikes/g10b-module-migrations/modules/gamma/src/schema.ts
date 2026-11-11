// G10b 모듈 gamma 스키마(제품 스키마가 아니다). 작성: AI 초안 (Authorship: G).
import { bigserial, pgSchema, text } from "drizzle-orm/pg-core";
export const gamma = pgSchema("gamma");
export const outbox = gamma.table("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(),
});
