-- beta raw 객체: CHECK 제약, 부분 인덱스
ALTER TABLE "beta"."ledger_line" ADD CONSTRAINT "ledger_line_status_chk" CHECK ("status" IN ('open', 'posted', 'void'));
--> statement-breakpoint
CREATE INDEX "ledger_line_open_idx" ON "beta"."ledger_line" ("id") WHERE "status" = 'open';
