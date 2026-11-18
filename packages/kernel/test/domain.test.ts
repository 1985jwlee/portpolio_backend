// 도메인 기반과 포트 사용 흐름 시험. 공개 표면(@pf/kernel)만 임포트한다.
import { describe, expect, test } from "bun:test";
import {
	AggregateRoot,
	type Clock,
	type CommandHandler,
	type DomainEvent,
	Entity,
	type IdGenerator,
	NotFoundError,
	Result,
	ValueObject,
} from "@pf/kernel";

class Name extends ValueObject<string> {
	constructor(value: string) {
		super(value);
	}
}

class Label extends ValueObject<string> {
	constructor(value: string) {
		super(value);
	}
}

class Thing extends Entity<string> {
	constructor(id: string) {
		super(id);
	}
}

class Counter extends AggregateRoot<string> {
	constructor(id: string, version: number) {
		super(id, version);
	}

	raise(event: DomainEvent): void {
		this.record(event);
	}
}

function eventOf(eventId: string, aggregateId = "agg-1"): DomainEvent {
	return {
		eventId,
		type: "counter.raised",
		schemaVersion: 1,
		occurredAt: new Date("2026-01-01T00:00:00.000Z"),
		aggregateId,
		aggregateVersion: 1,
	};
}

describe("ValueObject", () => {
	test("같은 클래스·같은 값이면 같다", () => {
		expect(new Name("a").equals(new Name("a"))).toBe(true);
	});

	test("같은 클래스라도 값이 다르면 다르다", () => {
		expect(new Name("a").equals(new Name("b"))).toBe(false);
	});

	test("값이 같아도 클래스가 다르면 다르다", () => {
		// Label 도 ValueObject<string> 이라 타입상 비교는 가능하다.
		expect(new Name("a").equals(new Label("a"))).toBe(false);
	});
});

describe("Entity", () => {
	test("id 를 노출한다", () => {
		expect(new Thing("t-1").id).toBe("t-1");
	});
});

describe("AggregateRoot", () => {
	test("생성자로 받은 version 을 노출하고 record 가 바꾸지 않는다", () => {
		const root = new Counter("agg-1", 3);
		expect(root.version).toBe(3);
		root.raise(eventOf("e-1"));
		expect(root.version).toBe(3);
	});

	test("pullEvents 는 기록 순서대로 돌려주고 다시 부르면 빈 배열이다", () => {
		const root = new Counter("agg-1", 0);
		root.raise(eventOf("e-1"));
		root.raise(eventOf("e-2"));
		expect(root.pullEvents().map((e) => e.eventId)).toEqual(["e-1", "e-2"]);
		expect(root.pullEvents()).toEqual([]);
	});

	test("돌려받은 배열은 이후의 기록과 얽히지 않는다", () => {
		const root = new Counter("agg-1", 0);
		root.raise(eventOf("e-1"));
		const first = root.pullEvents();
		root.raise(eventOf("e-2"));
		expect(root.pullEvents().map((e) => e.eventId)).toEqual(["e-2"]);
		expect(first.map((e) => e.eventId)).toEqual(["e-1"]);
	});
});

describe("포트 사용 흐름", () => {
	test("고정 Clock·IdGenerator 로 만든 이벤트가 그대로 기록·회수된다", () => {
		const fixedAt = new Date("2026-02-03T04:05:06.789Z");
		const clock: Clock = { now: () => fixedAt };
		const ids: IdGenerator = { next: () => "id-fixed" };
		const root = new Counter("agg-1", 0);
		const event: DomainEvent = {
			eventId: ids.next(),
			type: "counter.raised",
			schemaVersion: 1,
			occurredAt: clock.now(),
			aggregateId: root.id,
			aggregateVersion: root.version + 1,
		};
		root.raise(event);
		expect(root.pullEvents()).toEqual([event]);
	});

	test("CommandHandler 구현이 Err 를 돌려주면 await 결과에서 오류를 볼 수 있다", async () => {
		const handler: CommandHandler<string, number> = {
			execute: async () => Result.err(new NotFoundError()),
		};
		const result = await handler.execute(undefined, "입력");
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error).toBeInstanceOf(NotFoundError);
	});
});
