CREATE SCHEMA "alpha";
--> statement-breakpoint
CREATE TABLE "alpha"."item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"actor_id" text NOT NULL,
	"deleted_at" timestamp with time zone
);
