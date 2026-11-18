import type { Instant } from "../domain.ts";

/** 현재 시각의 출처. 구현(시스템 시계·고정 시계)은 이 패키지 밖에 둔다. */
export interface Clock {
	now(): Instant;
}
