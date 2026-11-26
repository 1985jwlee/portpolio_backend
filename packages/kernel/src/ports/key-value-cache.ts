/** 만료 시간이 있는 키-값 캐시. 구현은 이 패키지 밖에 둔다. */
export interface KeyValueCache<V> {
	/** 없거나 만료됐으면 `undefined`. */
	get(key: string): V | undefined;
	/** `ttlMs` 가 지나면 만료된다. */
	set(key: string, value: V, ttlMs: number): void;
	/** 키를 무효화한다. 없는 키는 무시한다. */
	invalidate(key: string): void;
}
