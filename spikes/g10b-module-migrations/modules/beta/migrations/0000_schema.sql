CREATE SCHEMA "beta";
--> statement-breakpoint
CREATE TABLE "beta"."ledger_line" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount" integer NOT NULL
);
