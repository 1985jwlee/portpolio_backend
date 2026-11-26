// KeyValueCache — 계약 스위트를 운영 메모리 구현과 testkit 대역에 돌리고, 메모리 구현 고유의 입력 검증을 본다.
import { describe, expect, test } from "bun:test";
import { ValidationError } from "@pf/kernel";
import { FakeClock, FakeKeyValueCache } from "@pf/testkit";
import { MemoryKeyValueCache } from "../src/index.ts";
import { runKeyValueCacheContract } from "./contract/key-value-cache.contract.ts";

runKeyValueCacheContract(
	"MemoryKeyValueCache",
	(clock, capacity) => new MemoryKeyValueCache<string>(clock, capacity),
);
runKeyValueCacheContract(
	"FakeKeyValueCache",
	(clock, capacity) => new FakeKeyValueCache<string>(clock, capacity),
);

describe("MemoryKeyValueCache 입력 검증", () => {
	test.each([0, -1, 1.5, Number.NaN])(
		"용량 %p 은 ValidationError 다",
		(capacity) => {
			expect(() => new MemoryKeyValueCache(new FakeClock(), capacity)).toThrow(
				ValidationError,
			);
		},
	);

	test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"ttlMs %p 은 ValidationError 다",
		(ttlMs) => {
			const cache = new MemoryKeyValueCache<string>(new FakeClock(), 1);
			expect(() => cache.set("a", "1", ttlMs)).toThrow(ValidationError);
		},
	);
});
