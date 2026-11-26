// PostgresAuditWriter(L2) — 대역 tx 로 "검증 → 행 쓰기 → 장애 지점" 순서·행 모양·오류 전파를 본다.
// 같은 트랜잭션에서 롤백되는지(AC-020)는 DB 가 있어야 보이므로 integration/audit-writer.test.ts 의 몫이다.
import { describe, expect, test } from "bun:test";
import type { TxContext } from "@pf/db";
import { type AuditEntry, type Faults, PermanentError } from "@pf/kernel";
import { FAULT_POINTS, FaultInjector, InjectedFaultError } from "@pf/testkit";
import {
	AUDIT_WRITER_AFTER_RECORD,
	PostgresAuditWriter,
} from "../src/adapter/postgres/audit-writer.ts";
import { auditLog } from "../src/adapter/postgres/schema.ts";

const NOW = new Date("2026-03-04T05:06:07.000Z");
const TRACE = "0192e3a4-5b6c-7d8e-9f01-23456789abcd";

const ENTRY: AuditEntry = {
	category: "admin",
	action: "entry_hidden",
	actorRole: "admin",
	actorKey: "user:42",
	targetType: "entry",
	targetId: "0192e3a4-5b6c-7d8e-9f01-23456789abce",
	outcome: "success",
	reasonCode: "state_invalid",
	traceId: TRACE,
	detail: { count: 1 },
};

// TxContext.db 는 Drizzle 트랜잭션 전체 타입이라 대역으로 채울 수 없다.
// 작성기가 쓰는 `insert(표).values(행)` 만 가진 객체를 `unknown` 을 거쳐 한 곳에서만 좁혀 쓴다.
// SAFETY: record 가 부르는 메서드는 insert·values 둘뿐이고 아래 대역이 둘 다 갖는다.
function fakeTx(log: string[]): {
	readonly tx: TxContext;
	readonly rows: unknown[];
} {
	const rows: unknown[] = [];
	const db = {
		insert: (table: unknown) => ({
			values: async (row: unknown) => {
				log.push(table === auditLog ? "insert:audit_log" : "insert:other");
				rows.push(row);
			},
		}),
	};
	return { tx: { db, now: NOW } as unknown as TxContext, rows };
}

function recordingFaults(log: string[]): Faults {
	return {
		hit: async (point) => {
			log.push(`hit:${point}`);
		},
	};
}

describe("PostgresAuditWriter.record", () => {
	test("tx.now 를 시각으로, 선택 필드가 없으면 null 로 한 행을 쓴다", async () => {
		const log: string[] = [];
		const { tx, rows } = fakeTx(log);
		const writer = new PostgresAuditWriter(recordingFaults(log));

		await writer.record(tx, ENTRY);
		await writer.record(tx, {
			category: "auth",
			action: "login_failed",
			actorRole: "anonymous",
			outcome: "denied",
			traceId: TRACE,
			detail: {},
		});

		expect(rows).toEqual([
			{
				at: NOW,
				category: "admin",
				action: "entry_hidden",
				actorRole: "admin",
				actorKey: "user:42",
				targetType: "entry",
				targetId: "0192e3a4-5b6c-7d8e-9f01-23456789abce",
				outcome: "success",
				reasonCode: "state_invalid",
				traceId: TRACE,
				detail: { count: 1 },
			},
			{
				at: NOW,
				category: "auth",
				action: "login_failed",
				actorRole: "anonymous",
				actorKey: null,
				targetType: null,
				targetId: null,
				outcome: "denied",
				reasonCode: null,
				traceId: TRACE,
				detail: {},
			},
		]);
	});

	test("행을 쓴 다음에 장애 지점을 부른다", async () => {
		const log: string[] = [];
		const { tx } = fakeTx(log);
		await new PostgresAuditWriter(recordingFaults(log)).record(tx, ENTRY);
		expect(log).toEqual([
			"insert:audit_log",
			"hit:events.audit_writer.after_record",
		]);
	});

	test("detail 이 규칙을 어기면 아무것도 쓰지 않고 지점도 부르지 않는다", async () => {
		const log: string[] = [];
		const { tx, rows } = fakeTx(log);
		const writer = new PostgresAuditWriter(recordingFaults(log));

		await expect(
			writer.record(tx, { ...ENTRY, detail: { token: "x" } }),
		).rejects.toBeInstanceOf(PermanentError);
		expect(rows).toEqual([]);
		expect(log).toEqual([]);
	});

	test("지점에서 주입된 장애는 그대로 전파된다(행은 이미 쓴 뒤라 호출 tx 가 롤백으로 지운다)", async () => {
		const log: string[] = [];
		const { tx, rows } = fakeTx(log);
		const faults = new FaultInjector();
		faults.failAt(FAULT_POINTS.AUDIT_WRITER_AFTER_RECORD);

		await expect(
			new PostgresAuditWriter(faults).record(tx, ENTRY),
		).rejects.toBeInstanceOf(InjectedFaultError);
		expect(rows).toHaveLength(1);
	});
});

describe("장애 지점 이름", () => {
	test("운영 코드의 상수가 testkit 의 FAULT_POINTS 와 같다(정본과 갈라지면 시험이 지점을 못 건드린다)", () => {
		expect(AUDIT_WRITER_AFTER_RECORD).toBe(
			FAULT_POINTS.AUDIT_WRITER_AFTER_RECORD,
		);
	});
});
