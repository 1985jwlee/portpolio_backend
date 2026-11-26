// 운영 식별자 발급기 — uuid v7(시간 순 정렬). 시험은 이것 대신 FakeIdGenerator 를 쓴다.
import type { IdGenerator, Uuid } from "@pf/kernel";

export class UuidV7Generator implements IdGenerator {
	next(): Uuid {
		return Bun.randomUUIDv7();
	}
}
