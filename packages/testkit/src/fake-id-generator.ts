import type { IdGenerator, Uuid } from "@pf/kernel";

// 시계를 읽지 않고 카운터만으로 만드는 uuid v7 형식 값이다.
// 48비트 시간 필드 자리에 카운터를 넣어, 문자열 정렬 순서가 곧 생성 순서가 된다.
// 버전 니블은 7, variant 는 10(`8`)이다.
const TIME_BASE = 0x0190_0000_0000;
const TIME_LIMIT = 0x1_0000_0000_0000;

export class FakeIdGenerator implements IdGenerator {
	#counter: number;

	constructor(seed = 0) {
		this.#counter = seed;
	}

	next(): Uuid {
		const time = TIME_BASE + this.#counter;
		if (time >= TIME_LIMIT) {
			throw new RangeError("FakeIdGenerator 의 48비트 시간 필드가 넘쳤다");
		}
		this.#counter += 1;
		const hex = time.toString(16).padStart(12, "0");
		return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`;
	}

	/** 카운터를 `seed` 로 되돌린다 — 같은 시드에서 같은 열이 다시 나온다. */
	reset(seed = 0): void {
		this.#counter = seed;
	}
}
