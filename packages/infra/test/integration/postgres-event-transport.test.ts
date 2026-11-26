// PostgresEventTransport(L3) — 디스패처 트랜잭션 안의 전달·NOTIFY 를 실제 Postgres 에서 본다.
// 같은 계약 스위트(메모리 구현과 공유)에 더해, 커밋·롤백·구독자 예외가 inbox 행·신호에 미치는 영향을 단언한다.
// 시험 전용 inbox 표(fixtures/inbox.sql)는 이 시험이 TestDb 새 스키마에 직접 만든다 — 마이그레이션이 아니다(Q9-A).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	createDbPool,
	type DbPool,
	PostgresUnitOfWork,
	type TxContext,
} from "@pf/db";
import {
	ConflictError,
	type EventEnvelope,
	type Receive,
	Result,
} from "@pf/kernel";
import { TestDb } from "@pf/testkit";
import {
	integer,
	jsonb,
	pgSchema,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { PostgresEventTransport, SystemClock } from "../../src/index.ts";
import {
	envelopeOf,
	runEventTransportContract,
} from "../contract/event-transport.contract.ts";
import { adminUrl, waitFor } from "./support.ts";

const SETUP_TIMEOUT_MS = 60_000;
const SIGNAL_TIMEOUT_MS = 10_000;

function inboxTable(schema: string) {
	return pgSchema(schema).table("inbox", {
		consumer: text("consumer").notNull(),
		messageId: uuid("message_id").notNull(),
		type: text("type").notNull(),
		schemaVersion: integer("schema_version").notNull(),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		payload: jsonb("payload").notNull(),
	});
}

const testDb = new TestDb(adminUrl());
let pool: DbPool;
let uow: PostgresUnitOfWork;
let listener: Bun.SQL;
let reader: Bun.ReservedSQL;
let inbox: ReturnType<typeof inboxTable>;
// LISTEN 연결이 받은 `inbox_new` 페이로드(= consumer 이름) — 커밋 순서대로 쌓인다.
const signals: string[] = [];

// 시험별 무작위 접미 — 같은 채널을 쓰는 다른 시험 파일의 신호가 섞이지 않게 자기 consumer 만 센다.
const suffix = crypto.randomUUID().slice(0, 8);
const consumerName = (label: string) => `${label}-${suffix}`;

beforeAll(async () => {
	await testDb.start();
	const fresh = await testDb.freshSchema();
	reader = fresh.sql;
	inbox = inboxTable(fresh.schema);
	const ddl = await Bun.file(
		new URL("./fixtures/inbox.sql", import.meta.url),
	).text();
	await reader.unsafe(ddl);
	pool = createDbPool({ url: testDb.url() });
	uow = new PostgresUnitOfWork(pool, new SystemClock());
	// LISTEN 은 NOTIFY 를 보내는 연결과 다른 전용 연결이다(G4 실측 방식).
	listener = new Bun.SQL(testDb.url());
	await listener.listen("inbox_new", (payload: string) => {
		signals.push(payload);
	});
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
	// 열린 연결이 bun test 를 붙잡지 않게 listener → pool → TestDb 순으로 닫는다.
	await listener.close();
	await pool.close(5_000);
	await testDb.stop();
});

/**
 * UnitOfWork 트랜잭션 안에서 fn 을 부른다. fn 이 던지면 UoW 가 감싼 오류에서 원래 오류를 꺼내 던진다
 * — 계약 스위트가 "receive 의 오류가 그대로 전파된다" 를 같은 모양으로 단언하게 한다.
 */
async function inTx<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
	const result = await uow.run(async (tx) => Result.ok(await fn(tx)));
	if (result.ok) {
		return result.value;
	}
	throw result.error.cause ?? result.error;
}

/** 구독 모듈의 ReceiveMessage 흉내 — 받은 봉투를 publish 와 같은 tx 로 inbox 에 저장한다. */
function storeInInbox(consumer: string): Receive<TxContext> {
	return async (envelope: EventEnvelope, tx: TxContext) => {
		await tx.db
			.insert(inbox)
			.values({
				consumer,
				messageId: envelope.id,
				type: envelope.type,
				schemaVersion: envelope.version,
				occurredAt: envelope.occurredAt,
				payload: envelope.payload,
			})
			.onConflictDoNothing();
	};
}

async function storedIds(consumer: string): Promise<string[]> {
	const rows = await reader.unsafe(
		"select message_id from inbox where consumer = $1 order by arrival",
		[consumer],
	);
	return rows.map((row: { message_id: string }) => row.message_id);
}

/**
 * 커밋하는 대조 publish 를 하나 보내고 그 신호가 올 때까지 기다린다.
 * LISTEN 연결이 받는 NOTIFY 는 커밋 순서라, 대조 신호가 왔다면 그보다 앞서 커밋된 신호는 이미 도착한 것이다 —
 * 그래서 "신호가 없다" 를 시간 대기가 아니라 순서로 판정한다.
 */
async function flushSignals(): Promise<void> {
	const control = consumerName(`flush-${crypto.randomUUID().slice(0, 8)}`);
	const transport = new PostgresEventTransport();
	transport.subscribe(control, async () => {});
	await inTx((tx) => transport.publish([envelopeOf(0)], tx));
	await waitFor(
		`대조 신호 ${control}`,
		() => signals.includes(control),
		SIGNAL_TIMEOUT_MS,
	);
}

runEventTransportContract<TxContext>("PostgresEventTransport", async () => ({
	transport: new PostgresEventTransport(),
	inTx,
}));

describe("PostgresEventTransport — 트랜잭션·NOTIFY", () => {
	test("커밋하면 inbox 행이 입력 순서로 생기고 consumer 이름의 신호가 한 번 온다", async () => {
		const consumer = consumerName("commit");
		const transport = new PostgresEventTransport();
		transport.subscribe(consumer, storeInInbox(consumer));
		const envelopes = [envelopeOf(1), envelopeOf(2), envelopeOf(3)];

		await inTx((tx) => transport.publish(envelopes, tx));

		expect(await storedIds(consumer)).toEqual(envelopes.map((e) => e.id));
		await flushSignals();
		// 봉투가 셋이어도 구독자당 신호는 한 번이다.
		expect(signals.filter((s) => s === consumer)).toEqual([consumer]);
	});

	test("트랜잭션이 롤백되면 inbox 행도 신호도 남지 않는다", async () => {
		const rolledBack = consumerName("rolled-back");
		const transport = new PostgresEventTransport();
		transport.subscribe(rolledBack, storeInInbox(rolledBack));

		const result = await uow.run(async (tx) => {
			await transport.publish([envelopeOf(1)], tx);
			return Result.err(new ConflictError({ message: "롤백 유도" }));
		});

		expect(result.ok).toBe(false);
		expect(await storedIds(rolledBack)).toEqual([]);
		await flushSignals();
		expect(signals).not.toContain(rolledBack);
	});

	test("뒤 구독자의 receive 가 던지면 앞 구독자가 저장한 행도 함께 롤백된다", async () => {
		const first = consumerName("first");
		const failing = consumerName("failing");
		const boom = new Error("receive 실패");
		const transport = new PostgresEventTransport();
		transport.subscribe(first, storeInInbox(first));
		transport.subscribe(failing, async () => {
			throw boom;
		});

		await expect(
			inTx((tx) => transport.publish([envelopeOf(1)], tx)),
		).rejects.toBe(boom);

		expect(await storedIds(first)).toEqual([]);
		await flushSignals();
		expect(signals).not.toContain(first);
		expect(signals).not.toContain(failing);
	});

	test("빈 봉투 목록은 행도 신호도 만들지 않는다", async () => {
		const consumer = consumerName("empty");
		const transport = new PostgresEventTransport();
		transport.subscribe(consumer, storeInInbox(consumer));

		await inTx((tx) => transport.publish([], tx));

		expect(await storedIds(consumer)).toEqual([]);
		await flushSignals();
		expect(signals).not.toContain(consumer);
	});

	test("consumer 이름은 바인드 인자로 간다 — 따옴표·세미콜론이 그대로 신호와 행에 도착한다", async () => {
		const nasty = `o'brien "q"; drop table inbox; -- ${suffix}`;
		const transport = new PostgresEventTransport();
		transport.subscribe(nasty, storeInInbox(nasty));

		await inTx((tx) => transport.publish([envelopeOf(1)], tx));

		await waitFor(
			"따옴표가 든 consumer 신호",
			() => signals.includes(nasty),
			SIGNAL_TIMEOUT_MS,
		);
		expect(await storedIds(nasty)).toHaveLength(1);
	});
});
