import type { Uuid } from "../domain.ts";

/** 새 식별자의 출처. 구현은 이 패키지 밖에 둔다. */
export interface IdGenerator {
	next(): Uuid;
}
