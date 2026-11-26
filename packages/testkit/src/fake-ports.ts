// 보조 포트 4종의 시험 대역 — 운영 구현(`@pf/infra`)과 같은 계약 스위트를 통과하는 가장 단순한 구현이다.
// testkit 은 infra 를 임포트할 수 없어(순환, B5) 운영 구현과 코드를 나누지 않는다. 검증·청소 같은 운영 방어는 두지 않는다.
// `Map.delete` 를 쓰므로 B11-write 제외 경로(`packages/testkit/src/`)에 있다(Q3).
import type {
	Clock,
	EventEnvelope,
	EventTransport,
	KeyValueCache,
	PresenceCounter,
	RateDecision,
	RateLimiter,
	RateRule,
	Receive,
	Subscription,
} from "@pf/kernel";
import { ValidationError } from "@pf/kernel";

// 부동소수 오차 허용치(토큰 단위) — 운영 구현과 같은 경계 판정을 하게 한다.
const EPSILON = 1e-9;

/** 토큰 버킷 대역. 버킷이 없으면 가득 찬 것으로 시작한다. */
export class FakeRateLimiter implements RateLimiter {
	readonly #clock: Clock;
	readonly #buckets = new Map<string, { tokens: number; atMs: number }>();

	constructor(clock: Clock) {
		this.#clock = clock;
	}

	async hit(key: string, rule: RateRule): Promise<RateDecision> {
		const nowMs = this.#clock.now().getTime();
		const bucket = this.#buckets.get(key) ?? {
			tokens: rule.capacity,
			atMs: nowMs,
		};
		const tokens = Math.min(
			rule.capacity,
			bucket.tokens + ((nowMs - bucket.atMs) * rule.refillPerSecond) / 1000,
		);
		const allowed = tokens + EPSILON >= 1;
		const left = allowed ? Math.max(0, tokens - 1) : tokens;
		this.#buckets.set(key, { tokens: left, atMs: nowMs });
		return allowed
			? { allowed: true, remaining: Math.floor(left) }
			: {
					allowed: false,
					retryAfterMs: Math.ceil(
						((1 - left - EPSILON) * 1000) / rule.refillPerSecond,
					),
				};
	}
}

/** 연결 id 집합 대역. */
export class FakePresenceCounter implements PresenceCounter {
	readonly #connections = new Set<string>();

	join(connId: string): void {
		this.#connections.add(connId);
	}

	leave(connId: string): void {
		this.#connections.delete(connId);
	}

	count(): number {
		return this.#connections.size;
	}
}

/** TTL·용량 상한(가장 오래 안 쓴 키 축출) 대역. 읽기도 최근성을 갱신한다. */
export class FakeKeyValueCache<V> implements KeyValueCache<V> {
	readonly #clock: Clock;
	readonly #capacity: number;
	readonly #entries = new Map<
		string,
		{ value: V; setAtMs: number; ttlMs: number }
	>();

	constructor(clock: Clock, capacity: number) {
		this.#clock = clock;
		this.#capacity = capacity;
	}

	get(key: string): V | undefined {
		const entry = this.#entries.get(key);
		if (entry === undefined) {
			return undefined;
		}
		this.#entries.delete(key);
		if (this.#clock.now().getTime() - entry.setAtMs >= entry.ttlMs) {
			return undefined;
		}
		this.#entries.set(key, entry);
		return entry.value;
	}

	set(key: string, value: V, ttlMs: number): void {
		this.#entries.delete(key);
		this.#entries.set(key, {
			value,
			setAtMs: this.#clock.now().getTime(),
			ttlMs,
		});
		if (this.#entries.size > this.#capacity) {
			const [oldest] = this.#entries.keys();
			if (oldest !== undefined) {
				this.#entries.delete(oldest);
			}
		}
	}

	invalidate(key: string): void {
		this.#entries.delete(key);
	}
}

/** 같은 프로세스 안에서 구독자에게 순서대로 넘기는 전달 대역. `tx` 는 해석하지 않고 그대로 넘긴다. */
export class InMemoryEventTransport<Tx> implements EventTransport<Tx> {
	readonly #subscribers = new Map<string, { readonly receive: Receive<Tx> }>();

	subscribe(consumer: string, receive: Receive<Tx>): Subscription {
		if (this.#subscribers.has(consumer)) {
			throw new ValidationError({
				message: "같은 consumer 이름으로 이미 구독 중이다",
				details: { consumer },
			});
		}
		const entry = { receive };
		this.#subscribers.set(consumer, entry);
		return {
			close: () => {
				// 같은 이름으로 다시 등록된 뒤의 늦은 close 가 남의 등록을 지우지 않게 한다.
				if (this.#subscribers.get(consumer) === entry) {
					this.#subscribers.delete(consumer);
				}
			},
		};
	}

	async publish(envelopes: readonly EventEnvelope[], tx: Tx): Promise<void> {
		for (const entry of [...this.#subscribers.values()]) {
			for (const envelope of envelopes) {
				await entry.receive(envelope, tx);
			}
		}
	}
}
