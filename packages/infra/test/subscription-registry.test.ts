// SubscriptionRegistry(L2) — 전달 순서와 `afterConsumer`(Postgres 전달에서는 NOTIFY) 호출 규칙.
// Postgres 구현의 신호 규칙(구독자당 한 번·빈 입력은 없음·실패하면 이후 없음)을 DB 없이 이 호스트에서 지킨다.
import { describe, expect, test } from "bun:test";
import { SubscriptionRegistry } from "../src/memory/subscription-registry.ts";
import { envelopeOf } from "./contract/event-transport.contract.ts";

function recorder() {
	const log: string[] = [];
	const registry = new SubscriptionRegistry<string>();
	const watch = (consumer: string) =>
		registry.add(consumer, async (envelope, tx) => {
			log.push(`${consumer}:${envelope.id.slice(-2)}@${tx}`);
		});
	const after = async (consumer: string) => {
		log.push(`after:${consumer}`);
	};
	return { log, registry, watch, after };
}

describe("SubscriptionRegistry.deliver", () => {
	test("구독자마다 봉투를 다 넘긴 뒤 afterConsumer 를 한 번 부른다", async () => {
		const { log, registry, watch, after } = recorder();
		watch("a");
		watch("b");
		await registry.deliver([envelopeOf(1), envelopeOf(2)], "T", after);
		expect(log).toEqual([
			"a:01@T",
			"a:02@T",
			"after:a",
			"b:01@T",
			"b:02@T",
			"after:b",
		]);
	});

	test("빈 입력은 receive 도 afterConsumer 도 부르지 않는다", async () => {
		const { log, registry, watch, after } = recorder();
		watch("a");
		await registry.deliver([], "T", after);
		expect(log).toEqual([]);
	});

	test("receive 가 던지면 그 구독자의 afterConsumer 도 이후 구독자도 없다", async () => {
		const { log, registry, watch, after } = recorder();
		const boom = new Error("실패");
		watch("a");
		registry.add("bad", async () => {
			throw boom;
		});
		watch("c");
		await expect(registry.deliver([envelopeOf(1)], "T", after)).rejects.toBe(
			boom,
		);
		expect(log).toEqual(["a:01@T", "after:a"]);
	});

	test("afterConsumer 가 던지면 이후 구독자에게 넘기지 않는다", async () => {
		const { log, registry, watch } = recorder();
		const boom = new Error("신호 실패");
		watch("a");
		watch("b");
		await expect(
			registry.deliver([envelopeOf(1)], "T", async () => {
				throw boom;
			}),
		).rejects.toBe(boom);
		expect(log).toEqual(["a:01@T"]);
	});

	test("닫은 구독자는 건너뛰고 afterConsumer 도 부르지 않는다", async () => {
		const { log, registry, watch, after } = recorder();
		const a = watch("a");
		watch("b");
		a.close();
		await registry.deliver([envelopeOf(1)], "T", after);
		expect(log).toEqual(["b:01@T", "after:b"]);
	});

	test("전달 중에 뒤 구독자가 닫히면 그 구독자는 건너뛴다", async () => {
		const log: string[] = [];
		const registry = new SubscriptionRegistry<string>();
		let later: { close(): void } | undefined;
		registry.add("first", async () => {
			log.push("first");
			later?.close();
		});
		later = registry.add("later", async () => {
			log.push("later");
		});
		await registry.deliver([envelopeOf(1)], "T");
		expect(log).toEqual(["first"]);
	});

	test("닫은 구독의 늦은 close 가 같은 이름으로 다시 등록한 구독을 지우지 않는다", async () => {
		const { log, registry, watch } = recorder();
		const old = watch("a");
		old.close();
		watch("a");
		old.close();
		await registry.deliver([envelopeOf(1)], "T");
		expect(log).toEqual(["a:01@T"]);
	});
});
