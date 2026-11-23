-- alpha raw 객체: 활성 행만 유일한 부분 UNIQUE 인덱스, 보조 함수
CREATE UNIQUE INDEX "item_active_uq" ON "alpha"."item" ("entry_id", "actor_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE FUNCTION "alpha"."count_active"() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM "alpha"."item" WHERE "deleted_at" IS NULL $$;
