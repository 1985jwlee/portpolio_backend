// 메모리 접속 수 — 연결 id 집합의 크기다. 인스턴스 간 합산은 되지 않는다(F16 §10.2 한계).
import type { PresenceCounter } from "@pf/kernel";

export class MemoryPresenceCounter implements PresenceCounter {
	readonly #connections = new Set<string>();

	join(connId: string): void {
		this.#connections.add(connId);
	}

	leave(connId: string): void {
		this.#connections.delete(connId);
	}

	count(): number {
		return this.#connections.size;
	}
}
