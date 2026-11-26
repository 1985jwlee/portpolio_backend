// ReadDb 의 계약 — select 계열만 있고 쓰기·트랜잭션 진입이 없다(ADR-025 "읽기 전용 핸들").
// L1: @ts-expect-error 줄은 `bun run typecheck` 가 판정한다(쓸모없어지면 TS2578). L2: 런타임 거절은 여기서 본다.
// DB 가 없다 — 존재하지 않는 주소로 만든 풀은 첫 쿼리 전까지 연결하지 않는다.
import { afterAll, describe, expect, test } from "bun:test";
import { createDbPool, type TxContext } from "@pf/db";

const pool = createDbPool({ url: "postgres://u:p@127.0.0.1:1/none" });

afterAll(async () => {
	await pool.close(5_000);
});

function takesTx(_tx: TxContext): void {}

describe("ReadDb", () => {
	test("select 계열 4개는 함수다", () => {
		expect(typeof pool.read.select).toBe("function");
		expect(typeof pool.read.selectDistinct).toBe("function");
		expect(typeof pool.read.selectDistinctOn).toBe("function");
		expect(typeof pool.read.$count).toBe("function");
	});

	test("쓰기·실행·트랜잭션·CTE 진입이 런타임에 없다", () => {
		for (const name of [
			"insert",
			"update",
			"delete",
			"execute",
			"transaction",
			"with",
			"$with",
		]) {
			expect(Reflect.has(pool.read, name)).toBe(false);
			expect(typeof Reflect.get(pool.read, name)).not.toBe("function");
		}
	});

	test("read 객체는 동결돼 있어 쓰기 메서드를 덧붙일 수 없다", () => {
		expect(Object.isFrozen(pool.read)).toBe(true);
	});

	test("타입: read 에는 insert 가 없고, ReadDb 는 TxContext 로 쓸 수 없다", () => {
		// @ts-expect-error — ReadDb 에는 insert 가 없다
		const insert = pool.read.insert;
		expect(insert).toBeUndefined();

		// @ts-expect-error — ReadDb 는 { db, now } 를 가진 TxContext 가 아니다
		takesTx(pool.read);
	});
});
