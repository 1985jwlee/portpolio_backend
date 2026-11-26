// events 스키마의 Drizzle 표 — 마이그레이션 SQL(migrations/0000_audit_log.sql)과 열 이름·타입이 같아야 한다.
// CHECK(category·reason_code 길이·detail 크기)와 인덱스는 SQL 이 정본이고 여기에는 옮기지 않는다 — 시험이 쓰는 모양만 둔다.
import {
	bigint,
	jsonb,
	pgSchema,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

const events = pgSchema("events");

/** 감사 로그 — 추가 전용(보안·운영 감사, ADR-027). 행위와 같은 트랜잭션에서 쓴다. */
export const auditLog = events.table("audit_log", {
	id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
	at: timestamp("at", { withTimezone: true }).notNull(),
	category: text("category").notNull(),
	action: text("action").notNull(),
	actorRole: text("actor_role").notNull(),
	actorKey: text("actor_key"),
	targetType: text("target_type"),
	targetId: text("target_id"),
	outcome: text("outcome").notNull(),
	reasonCode: text("reason_code"),
	traceId: uuid("trace_id").notNull(),
	detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
});
