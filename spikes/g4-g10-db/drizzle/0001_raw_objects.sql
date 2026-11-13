-- G10 raw 객체: 스키마 정의(Drizzle)로 표현할 수 없는 것들. drizzle-kit generate --custom 이 만든 파일에 들어간다.
-- 부분 UNIQUE: 활성(deleted_at IS NULL) 반응만 (entry, actor, emoji) 유일
CREATE UNIQUE INDEX "reaction_active_uq" ON "spike"."reaction" ("entry_id", "actor_id", "emoji") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
-- 부분 인덱스: 대기 중 행만 (선점 쿼리용)
CREATE INDEX "outbox_pending_idx" ON "spike"."outbox" ("id") WHERE "status" = 'pending';
--> statement-breakpoint
-- CHECK 제약
ALTER TABLE "spike"."outbox" ADD CONSTRAINT "outbox_status_chk" CHECK ("status" IN ('pending', 'processing', 'done', 'dead'));
--> statement-breakpoint
-- 어드바이저리 락 보조 함수: 리더 선출용 세션 락(전용 연결에서만 의미가 있다)
CREATE FUNCTION "spike"."try_leader"(key bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT pg_try_advisory_lock(key) $$;
--> statement-breakpoint
-- 아웃박스 삽입 알림 트리거(LISTEN/NOTIFY 경로)
CREATE FUNCTION "spike"."notify_outbox"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('outbox', NEW.id::text); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER "outbox_notify_trg" AFTER INSERT ON "spike"."outbox" FOR EACH ROW EXECUTE FUNCTION "spike"."notify_outbox"();
