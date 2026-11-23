-- beta raw 객체: 활성 행만 유일한 부분 UNIQUE 인덱스, 보조 함수
CREATE UNIQUE INDEX "thing_active_uq" ON "beta"."thing" ("entry_id", "actor_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE FUNCTION "beta"."count_active"() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM "beta"."thing" WHERE "deleted_at" IS NULL $$;
