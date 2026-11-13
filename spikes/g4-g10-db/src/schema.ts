// G4·G10 스파이크 스키마(제품 스키마가 아니다). 작성: AI 초안 (Authorship: G).
import { bigserial, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const spike = pgSchema("spike");

// 아웃박스 모양: 선점(SKIP LOCKED)·임대·소유 토큰
export const outbox = spike.table("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  ownerToken: text("owner_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 소프트 삭제되는 반응: 활성 행만 유일해야 한다(raw 부분 UNIQUE 인덱스로 건다)
export const reaction = spike.table("reaction", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entryId: integer("entry_id").notNull(),
  actorId: text("actor_id").notNull(),
  emoji: text("emoji").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
