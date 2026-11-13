CREATE SCHEMA "spike";
--> statement-breakpoint
CREATE TABLE "spike"."outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"owner_token" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spike"."reaction" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"actor_id" text NOT NULL,
	"emoji" text NOT NULL,
	"deleted_at" timestamp with time zone
);
