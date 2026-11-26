// notify 의 입력 검증(L2) — 채널 이름은 I/O 앞에서 거른다. 실제 전달(커밋·롤백)은 infra 의 통합 시험이 본다.
import { describe, expect, test } from "bun:test";
import { ValidationError } from "@pf/kernel";
import { notify, type TxContext } from "../src/index.ts";

// 검증이 I/O 앞에서 끝나는지 보려는 시험이라 db 가 호출되면 던지는 가짜를 쓴다. 검증을 지나치면 이 오류가 먼저 나와 시험이 빨강이 된다.
// SAFETY: notify 는 검증을 통과한 뒤에만 tx.db.execute 를 부르고, 이 시험은 그 앞에서 끝난다 — 가짜가 TxDb 의 나머지 표면을 흉내 낼 필요가 없다.
const tx = {
	db: {
		execute: () => {
			throw new Error("db 에 닿으면 안 된다");
		},
	},
	now: new Date("2026-01-01T00:00:00.000Z"),
} as unknown as TxContext;

describe("notify 채널 이름 검증", () => {
	test.each([
		"",
		"Inbox_New",
		"inbox-new",
		"inbox new",
		"1inbox",
		"inbox;drop",
		'in"box',
		"inbox\n",
	])("채널 %p 은 ValidationError 로 거부한다", async (channel) => {
		await expect(notify(tx, channel, "payload")).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	test("식별자 모양의 채널은 검증을 통과해 db 로 간다", async () => {
		await expect(notify(tx, "inbox_new", "payload")).rejects.toThrow(
			"db 에 닿으면 안 된다",
		);
	});
});
