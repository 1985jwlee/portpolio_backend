import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

export const item = pgSchema("fixture").table("item", {
	id: uuid("id").primaryKey(),
	body: text("body").notNull(),
});
