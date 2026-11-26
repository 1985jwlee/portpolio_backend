import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

export const item = pgSchema("fixture").table("item", {
	id: uuid("id").primaryKey(),
	secret: text("secret"),
	note: text("note"),
	noteEnc: text("note_enc"),
});
