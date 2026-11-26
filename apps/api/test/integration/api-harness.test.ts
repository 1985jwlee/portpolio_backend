// ApiHarness + readyz(L3) — 실제 Postgres 에서 앱이 뜨고, 풀을 닫아 "DB 중단" 을 흉내 내면 readyz 만 503 이 된다.
// 이 호스트에는 Postgres 가 없어 CI `integration` 잡이 첫 실행이다(검증 계획 4절 6번과 같은 시나리오).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiHarness } from "../support/api-harness.ts";
import { adminUrl } from "./support.ts";

const harness = new ApiHarness(adminUrl());

beforeAll(async () => {
	await harness.setup();
});

afterAll(async () => {
	await harness.teardown();
});

const get = (path: string) =>
	harness.request(new Request(`http://localhost${path}`));

describe("ApiHarness", () => {
	test("DB 가 살아 있으면 healthz·readyz 가 200 이고 응답에 X-Trace-Id 가 있다", async () => {
		const healthz = await get("/healthz");
		const readyz = await get("/readyz");
		expect(healthz.status).toBe(200);
		expect(readyz.status).toBe(200);
		expect(readyz.headers.get("X-Trace-Id")).not.toBeNull();
		const body = (await readyz.json()) as {
			status: string;
			checks: Record<string, { status: string }>;
		};
		expect(body.status).toBe("ok");
		expect(body.checks.db?.status).toBe("ok");
	});

	test("시작한 루트는 실제 포트를 열어 둔다(포트 0)", () => {
		expect(harness.root.port).toBeGreaterThan(0);
	});

	test("풀을 닫으면 readyz 는 503 이고 healthz 는 계속 200 이다", async () => {
		await harness.root.dbPool.pool.close(0);
		const readyz = await get("/readyz");
		const healthz = await get("/healthz");
		expect(readyz.status).toBe(503);
		expect(healthz.status).toBe(200);
		// 본문에 접속 주소·비밀이 실리지 않는다.
		const text = JSON.stringify(await readyz.json());
		expect(text).not.toContain("postgres://");
	});
});
