CREATE SCHEMA IF NOT EXISTS "events";
--> statement-breakpoint
CREATE TABLE "events"."audit_log" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"at" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"actor_role" text NOT NULL,
	"actor_key" text,
	"target_type" text,
	"target_id" text,
	"outcome" text NOT NULL,
	"reason_code" text,
	"trace_id" uuid NOT NULL,
	"detail" jsonb NOT NULL,
	CONSTRAINT "audit_log_category_check" CHECK ("category" IN ('auth', 'admin', 'system')),
	CONSTRAINT "audit_log_reason_code_length_check" CHECK ("reason_code" IS NULL OR char_length("reason_code") <= 64),
	CONSTRAINT "audit_log_detail_size_check" CHECK (pg_column_size("detail") <= 2048)
);
--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "events"."audit_log" ("at");
--> statement-breakpoint
CREATE INDEX "audit_log_category_at_idx" ON "events"."audit_log" ("category", "at");
--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "events"."audit_log" ("action", "at");
-- 검증용 변조
