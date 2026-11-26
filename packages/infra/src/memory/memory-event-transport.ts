// 메모리 전달 — 같은 프로세스 안의 구독자에게 `receive` 로 넘긴다. NOTIFY·저장이 없고 `tx` 는 해석하지 않고 그대로 넘긴다.
import type {
	EventEnvelope,
	EventTransport,
	Receive,
	Subscription,
} from "@pf/kernel";
import { SubscriptionRegistry } from "./subscription-registry.ts";

export class MemoryEventTransport<Tx> implements EventTransport<Tx> {
	readonly #registry = new SubscriptionRegistry<Tx>();

	subscribe(consumer: string, receive: Receive<Tx>): Subscription {
		return this.#registry.add(consumer, receive);
	}

	publish(envelopes: readonly EventEnvelope[], tx: Tx): Promise<void> {
		return this.#registry.deliver(envelopes, tx);
	}
}
