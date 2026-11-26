// 운영 시계·식별자 발급기·장애 주입 훅 — 시험은 FakeClock·FakeIdGenerator 를 쓰므로 여기서만 실물을 본다.
import { describe, expect, test } from "bun:test";
import { NoopFaults, SystemClock, UuidV7Generator } from "../src/index.ts";

describe("SystemClock", () => {
	test("실제 현재 시각을 새 Date 로 준다", () => {
		const before = Date.now();
		const now = new SystemClock().now();
		const after = Date.now();
		expect(now).toBeInstanceOf(Date);
		expect(now.getTime()).toBeGreaterThanOrEqual(before);
		expect(now.getTime()).toBeLessThanOrEqual(after);
	});
});

describe("UuidV7Generator", () => {
	const generator = new UuidV7Generator();

	test("uuid v7 형식이다(버전 7·variant 8~b)", () => {
		expect(generator.next()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	test("호출마다 다르다", () => {
		const ids = new Set(Array.from({ length: 1000 }, () => generator.next()));
		expect(ids.size).toBe(1000);
	});
});

describe("NoopFaults", () => {
	test("어떤 이름이든 즉시 끝나고 던지지 않는다", async () => {
		const faults = new NoopFaults();
		await faults.hit("events.audit_writer.after_record");
		await faults.hit("아무 이름");
	});
});
