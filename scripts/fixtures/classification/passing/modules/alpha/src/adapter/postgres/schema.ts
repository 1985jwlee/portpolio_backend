import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const item = pgSchema("alpha").table("item", {
	id: uuid("id").primaryKey(),
	body: text("body").notNull(),
	noteEnc: text("note_enc"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
