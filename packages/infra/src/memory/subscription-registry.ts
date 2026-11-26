// 구독 등록부와 전달 순서 규칙 — 메모리·Postgres 전달 구현이 같은 순서로 `receive` 를 부르게 하는 한 곳이다.
// `Map.delete` 를 쓰므로 B11-write 제외 경로(`packages/infra/src/memory/`)에 둔다. 전달 계층의 NOTIFY·저장은 이 파일의 책임이 아니다.
import {
	type EventEnvelope,
	type Receive,
	type Subscription,
	ValidationError,
} from "@pf/kernel";

type Entry<Tx> = {
	readonly consumer: string;
	readonly receive: Receive<Tx>;
	active: boolean;
};

export class SubscriptionRegistry<Tx> {
	// Map 은 삽입 순서를 지킨다 — 등록 순서가 곧 전달 순서다.
	readonly #entries = new Map<string, Entry<Tx>>();

	/** 같은 이름이 이미 있으면 `ValidationError` — 두 구독자가 같은 inbox 키를 쓰면 한쪽이 조용히 버려진다. */
	add(consumer: string, receive: Receive<Tx>): Subscription {
		if (this.#entries.has(consumer)) {
			throw new ValidationError({
				message: "같은 consumer 이름으로 이미 구독 중이다",
				details: { consumer },
			});
		}
		const entry: Entry<Tx> = { consumer, receive, active: true };
		this.#entries.set(consumer, entry);
		return {
			close: () => {
				// 이미 닫았거나 같은 이름으로 다시 등록된 뒤에는 남의 등록을 건드리지 않는다.
				if (this.#entries.get(consumer) === entry) {
					this.#entries.delete(consumer);
				}
				entry.active = false;
			},
		};
	}

	/**
	 * 구독자마다(등록 순서) 봉투를 입력 순서대로 `receive` 에 넘긴다. 한 구독자에게 다 넘기면 `afterConsumer` 를 부른다.
	 * `receive`·`afterConsumer` 가 던지면 그대로 전파하고 남은 구독자에게는 넘기지 않는다. 빈 입력은 아무것도 하지 않는다.
	 */
	async deliver(
		envelopes: readonly EventEnvelope[],
		tx: Tx,
		afterConsumer?: (consumer: string) => Promise<void>,
	): Promise<void> {
		if (envelopes.length === 0) {
			return;
		}
		// 전달 중 다른 구독자가 닫혀도 순회가 흔들리지 않게 복사본으로 돈다. 닫힌 구독자는 건너뛴다.
		for (const entry of [...this.#entries.values()]) {
			if (!entry.active) {
				continue;
			}
			for (const envelope of envelopes) {
				await entry.receive(envelope, tx);
			}
			await afterConsumer?.(entry.consumer);
		}
	}
}
