// 메모리 키-값 캐시 — TTL 과 용량 상한(LRU). 인스턴스 간 무효화는 되지 않는다(F16 §10.2 한계).
// Map 의 삽입 순서를 최근성으로 쓴다: 읽거나 쓰면 맨 뒤로 옮기고, 넘치면 맨 앞(가장 오래 안 쓴 키)을 버린다.
import { type Clock, type KeyValueCache, ValidationError } from "@pf/kernel";

type Entry<V> = {
	readonly value: V;
	readonly setAtMs: number;
	readonly ttlMs: number;
};

export class MemoryKeyValueCache<V> implements KeyValueCache<V> {
	readonly #clock: Clock;
	readonly #capacity: number;
	readonly #entries = new Map<string, Entry<V>>();

	constructor(clock: Clock, capacity: number) {
		if (!Number.isSafeInteger(capacity) || capacity < 1) {
			throw new ValidationError({
				message: "캐시 용량은 1 이상의 정수여야 한다",
				details: { capacity },
			});
		}
		this.#clock = clock;
		this.#capacity = capacity;
	}

	get(key: string): V | undefined {
		const entry = this.#entries.get(key);
		if (entry === undefined) {
			return undefined;
		}
		this.#entries.delete(key);
		// 경계: 정확히 ttlMs 가 지난 순간부터 만료다.
		if (this.#clock.now().getTime() - entry.setAtMs >= entry.ttlMs) {
			return undefined;
		}
		this.#entries.set(key, entry);
		return entry.value;
	}

	set(key: string, value: V, ttlMs: number): void {
		if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
			throw new ValidationError({
				message: "ttlMs 는 0 보다 큰 유한한 수여야 한다",
				details: { ttlMs },
			});
		}
		this.#entries.delete(key);
		this.#entries.set(key, {
			value,
			setAtMs: this.#clock.now().getTime(),
			ttlMs,
		});
		if (this.#entries.size > this.#capacity) {
			const oldest = this.#entries.keys().next();
			if (!oldest.done) {
				this.#entries.delete(oldest.value);
			}
		}
	}

	invalidate(key: string): void {
		this.#entries.delete(key);
	}
}
