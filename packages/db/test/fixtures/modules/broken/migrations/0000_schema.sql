CREATE SCHEMA "broken";
--> statement-breakpoint
CREATE TABLE "broken"."thing" (
	"id" integer PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"actor_id" text NOT NULL,
	"deleted_at" timestamp with time zone
);
