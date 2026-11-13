// G10b 모듈 beta 스키마(제품 스키마가 아니다). 작성: AI 초안 (Authorship: G).
import { bigserial, integer, pgSchema, text } from "drizzle-orm/pg-core";
export const beta = pgSchema("beta");
export const ledgerLine = beta.table("ledger_line", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  status: text("status").notNull().default("open"),
  amount: integer("amount").notNull(),
});
