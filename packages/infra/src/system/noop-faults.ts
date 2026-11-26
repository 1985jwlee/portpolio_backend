// 운영 장애 주입 훅 — 아무 일도 하지 않고 즉시 끝난다. 시험은 이것 대신 testkit 의 FaultInjector 를 쓴다.
import type { Faults } from "@pf/kernel";

export class NoopFaults implements Faults {
	hit(_point: string): Promise<void> {
		return Promise.resolve();
	}
}
