// 메모리 속도 제한 — 키별 토큰 버킷. 레플리카 간 한도는 공유되지 않는다(F16 §10.2 한계).
// 시각은 주입한 Clock 에서만 읽는다 — 시험이 기다리지 않고 시계를 옮긴다.
import {
	type Clock,
	type RateDecision,
	type RateLimiter,
	type RateRule,
	ValidationError,
} from "@pf/kernel";

type Bucket = {
	// 소수 토큰을 그대로 둔다 — 반올림하면 보충이 쌓이지 않는다.
	readonly tokens: number;
	// 이 시각에 tokens 를 계산했다. 이후 경과분만큼 보충한다.
	readonly updatedMs: number;
	// 이 시각이면 가득 찬다 — 가득 찬 버킷은 없는 버킷과 같아서 지워도 된다.
	readonly fullAtMs: number;
};

// 부동소수 오차 허용치(토큰 단위) — 정확히 토큰 하나 분량이 지난 경계가 0.9999999999999999 로 계산돼 거절되거나
// 재시도 시간이 1ms 부풀지 않게 한다.
const EPSILON = 1e-9;

// 호출 N 번마다 한 번 청소한다. 매 호출 훑으면 키가 많을 때 호출마다 O(키 수)가 든다.
const SWEEP_EVERY_HITS = 256;

export class MemoryRateLimiter implements RateLimiter {
	readonly #clock: Clock;
	readonly #buckets = new Map<string, Bucket>();
	#hitsSinceSweep = 0;

	constructor(clock: Clock) {
		this.#clock = clock;
	}

	/** 지금 들고 있는 키 수 — 청소 시험이 본다. */
	get trackedKeys(): number {
		return this.#buckets.size;
	}

	async hit(key: string, rule: RateRule): Promise<RateDecision> {
		if (!(Number.isFinite(rule.capacity) && rule.capacity >= 1)) {
			throw new ValidationError({
				message: "RateRule.capacity 는 1 이상의 유한한 수여야 한다",
				details: { capacity: rule.capacity },
			});
		}
		if (!(Number.isFinite(rule.refillPerSecond) && rule.refillPerSecond > 0)) {
			throw new ValidationError({
				message: "RateRule.refillPerSecond 는 0 보다 큰 유한한 수여야 한다",
				details: { refillPerSecond: rule.refillPerSecond },
			});
		}
		const clockMs = this.#clock.now().getTime();
		this.#sweepSometimes(clockMs);

		const bucket = this.#buckets.get(key);
		// 시계가 뒤로 가도 기준 시각은 뒤로 물리지 않는다 — 물리면 이미 센 시간을 시계가 되돌아올 때 한 번 더 보충한다.
		const nowMs =
			bucket === undefined ? clockMs : Math.max(clockMs, bucket.updatedMs);
		// 버킷이 없으면 가득 찬 버킷이다.
		const elapsedMs = bucket === undefined ? 0 : nowMs - bucket.updatedMs;
		const refilled =
			bucket === undefined
				? rule.capacity
				: Math.min(
						rule.capacity,
						bucket.tokens + (elapsedMs * rule.refillPerSecond) / 1000,
					);

		const allowed = refilled + EPSILON >= 1;
		const tokens = allowed ? Math.max(0, refilled - 1) : refilled;
		this.#buckets.set(key, {
			tokens,
			updatedMs: nowMs,
			fullAtMs:
				nowMs +
				Math.ceil(((rule.capacity - tokens) * 1000) / rule.refillPerSecond),
		});

		return allowed
			? { allowed: true, remaining: Math.floor(tokens) }
			: {
					allowed: false,
					retryAfterMs: Math.ceil(
						((1 - tokens - EPSILON) * 1000) / rule.refillPerSecond,
					),
				};
	}

	#sweepSometimes(nowMs: number): void {
		this.#hitsSinceSweep += 1;
		if (this.#hitsSinceSweep < SWEEP_EVERY_HITS) {
			return;
		}
		this.#hitsSinceSweep = 0;
		for (const [key, bucket] of this.#buckets) {
			if (bucket.fullAtMs <= nowMs) {
				this.#buckets.delete(key);
			}
		}
	}
}
