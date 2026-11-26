// worker 의 /healthz(L3) — 실제 Postgres 에서 200 이고, 풀을 닫아 "DB 중단" 을 흉내 내면 503 이다.
// 이 호스트에는 Postgres 가 없어 CI `integration` 잡이 첫 실행이다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SecretString } from "@pf/config";
import { TestDb } from "@pf/testkit";
import { WorkerRoot } from "../../src/compose/root.ts";
import { adminUrl } from "./support.ts";

const db = new TestDb(adminUrl());
let root: WorkerRoot;

beforeAll(async () => {
	await db.start();
	root = new WorkerRoot({
		config: {
			APP_ENV: "test",
			LOG_LEVEL: "debug",
			DATABASE_URL: new SecretString(db.url()),
			// 0 이면 운영체제가 빈 포트를 고른다.
			WORKER_PORT: 0,
		},
		clock: { now: () => new Date("2026-11-26T00:00:00.000Z") },
		ids: { next: () => crypto.randomUUID() },
		sink: { write: () => undefined },
	});
	await root.start();
});

afterAll(async () => {
	await root.stop(5_000);
	await db.stop();
});

const healthz = () => root.handle(new Request("http://localhost/healthz"));

describe("worker /healthz", () => {
	test("DB 가 살아 있으면 200 이고 실제 포트가 열려 있다", async () => {
		expect((await healthz()).status).toBe(200);
		const viaSocket = await fetch(`http://127.0.0.1:${root.port}/healthz`);
		expect(viaSocket.status).toBe(200);
	});

	test("풀을 닫으면 503 이다", async () => {
		await root.dbPool.pool.close(0);
		expect((await healthz()).status).toBe(503);
	});
});
