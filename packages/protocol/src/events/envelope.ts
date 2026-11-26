import { type Static, Type } from "@sinclair/typebox";

// 이벤트 봉투 공통 필드(05 §1). outbox·inbox 행과 소비자 핸들러 입력이 같은 모양이다.
// 종류별 payload 스키마는 각 이벤트를 소유한 모듈의 계약 몫이라 여기서는 열린 객체로 둔다(ADR-052 결정 2).
const OWNER_KEY =
	"^(session|user):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export const EventEnvelope = Type.Object({
	id: Type.String({ format: "uuid" }),
	seq: Type.Integer({ minimum: 0 }),
	type: Type.String({ pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$" }),
	schemaVersion: Type.Integer({ minimum: 1 }),
	occurredAt: Type.String({ format: "date-time" }),
	aggregate: Type.Object({
		type: Type.String({ minLength: 1 }),
		id: Type.String({ format: "uuid" }),
		version: Type.Integer({ minimum: 0 }),
	}),
	traceId: Type.String({ format: "uuid" }),
	ownerKey: Type.Union([Type.String({ pattern: OWNER_KEY }), Type.Null()]),
	payload: Type.Record(Type.String(), Type.Unknown()),
});

export type EventEnvelope = Static<typeof EventEnvelope>;
