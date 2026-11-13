// G10b 모듈 alpha 스키마(제품 스키마가 아니다). 작성: AI 초안 (Authorship: G).
import { bigserial, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
export const alpha = pgSchema("alpha");
export const item = alpha.table("item", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entryId: integer("entry_id").notNull(),
  actorId: text("actor_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
