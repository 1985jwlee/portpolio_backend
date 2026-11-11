CREATE SCHEMA "gamma";
--> statement-breakpoint
CREATE TABLE "gamma"."outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL
);
