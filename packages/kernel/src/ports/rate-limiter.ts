/** 한도 규칙 — 버킷 크기와 초당 보충량. */
export type RateRule = {
	/** 버킷이 담는 최대 토큰 수. 1 이상. */
	readonly capacity: number;
	/** 초당 보충하는 토큰 수. 0 초과. */
	readonly refillPerSecond: number;
};

export type RateDecision =
	| { readonly allowed: true; readonly remaining: number }
	| { readonly allowed: false; readonly retryAfterMs: number };

/** 키별 속도 제한. 구현은 이 패키지 밖에 둔다. */
export interface RateLimiter {
	/** 키의 토큰 하나를 쓰려 한다. 규칙이 잘못됐으면 `ValidationError` 를 던진다. */
	hit(key: string, rule: RateRule): Promise<RateDecision>;
}
