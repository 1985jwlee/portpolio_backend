-- alpha raw 객체: 활성 행만 유일한 부분 UNIQUE 인덱스, 세션 락 보조 함수
CREATE UNIQUE INDEX "item_active_uq" ON "alpha"."item" ("entry_id", "actor_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE FUNCTION "alpha"."try_leader"(key bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT pg_try_advisory_lock(key) $$;
