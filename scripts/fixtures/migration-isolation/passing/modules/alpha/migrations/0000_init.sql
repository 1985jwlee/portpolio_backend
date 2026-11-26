-- beta.items 는 주석 안이라 무시한다.
CREATE SCHEMA IF NOT EXISTS "alpha";
--> statement-breakpoint
/* 블록 주석 안의 beta.items 도 무시한다 /* 중첩된 gamma.rows */ 끝 */
CREATE TABLE "alpha"."entry" (
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
	"body" text NOT NULL DEFAULT 'beta.items 는 문자열이다',
	"note" text DEFAULT E'it\'s beta.items',
	"at" timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
	CONSTRAINT "entry_body_check" CHECK (char_length("body") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entry_at_idx" ON ALPHA.entry ("at");
--> statement-breakpoint
CREATE FUNCTION alpha.touch() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
	NEW.at := pg_catalog.now();
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER entry_touch BEFORE UPDATE ON "alpha"."entry" FOR EACH ROW EXECUTE FUNCTION alpha.touch();
--> statement-breakpoint
CREATE TABLE pf_migrations.marker (id int);
--> statement-breakpoint
SELECT 1.5::information_schema.cardinal_number FROM alpha.entry WHERE 1.5 > 1;
