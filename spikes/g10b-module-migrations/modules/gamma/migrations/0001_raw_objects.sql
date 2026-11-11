-- gamma raw 객체: 삽입 알림 트리거(자기 채널 gamma_outbox 만 쓴다)
CREATE FUNCTION "gamma"."notify_outbox"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('gamma_outbox', NEW.id::text); RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER "outbox_notify_trg" AFTER INSERT ON "gamma"."outbox" FOR EACH ROW EXECUTE FUNCTION "gamma"."notify_outbox"();
