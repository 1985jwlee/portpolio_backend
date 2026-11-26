import type { Clock, Instant } from "@pf/kernel";
import { ValidationError } from "@pf/kernel";

// 시험이 시각을 손으로 고정·전진시키는 시계. 임대·만료·백오프 시험이 실제로 기다리지 않게 한다.
const DEFAULT_START = "2026-01-01T00:00:00.000Z";

export class FakeClock implements Clock {
	#epochMs: number;

	constructor(start: Instant = new Date(DEFAULT_START)) {
		this.#epochMs = start.getTime();
	}

	/** 호출자가 돌려받은 값을 바꿔도 시계가 흔들리지 않도록 매번 새 `Date` 를 준다. */
	now(): Instant {
		return new Date(this.#epochMs);
	}

	/** 시각을 앞으로만 보낸다. 음수·유한하지 않은 값은 단조성을 깨므로 거부한다. */
	advance(ms: number): void {
		if (!Number.isFinite(ms) || ms < 0) {
			throw new ValidationError({
				message: "FakeClock.advance 는 0 이상의 유한한 ms 만 받는다",
				details: { ms },
			});
		}
		this.#epochMs += ms;
	}

	/** 시각을 임의로 옮긴다 — 되돌리는 것까지 허용하는 유일한 경로라 명시적으로 부른다. */
	set(instant: Instant): void {
		this.#epochMs = instant.getTime();
	}
}
