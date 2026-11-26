// 운영 시계 — 실제 현재 시각을 밀리초 정밀 UTC 로 준다. 시험은 이것 대신 FakeClock 을 쓴다.
import type { Clock, Instant } from "@pf/kernel";

export class SystemClock implements Clock {
	now(): Instant {
		return new Date();
	}
}
