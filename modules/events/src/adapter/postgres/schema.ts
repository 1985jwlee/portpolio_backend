// events 스키마의 Drizzle 표 — 마이그레이션 SQL(migrations/0000_audit_log.sql)과 열 이름·타입이 같아야 한다.
// CHECK(category·reason_code 길이·detail 크기)와 인덱스는 SQL 이 정본이고 여기에는 옮기지 않는다 — 시험이 쓰는 모양만 둔다.
import {
	bigint,
	customType,
	pgSchema,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// drizzle 0.45.4 의 jsonb 는 값을 JSON.stringify 한 문자열로 넘기는데, Bun.SQL 은 jsonb 매개변수를 다시 JSON 으로 직렬화한다 —
// 그러면 행에 객체가 아니라 JSON 문자열 스칼라('"{\\"count\\":1}"')가 들어간다(첫 CI 의 audit-writer 시험이 잡았다).
// 그래서 객체를 그대로 넘기는 열 형식을 쓴다 — 직렬화는 드라이버 한 곳에서만 한다.
const jsonbObject = customType<{
	data: Record<string, unknown>;
	driverData: Record<string, unknown>;
}>({
	dataType: () => "jsonb",
	toDriver: (value) => value,
	fromDriver: (value) => value,
});

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
	detail: jsonbObject("detail").notNull(),
});
