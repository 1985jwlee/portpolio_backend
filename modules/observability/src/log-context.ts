// 비동기 경계를 넘어 trace_id 를 따라가는 로그 맥락(F17 §6.3) — AsyncLocalStorage 기반.
// Bun 에서의 동작은 G5 미확인이었고 `log-context.test.ts` 의 "await 경계" 시험이 확인한다. 실패하면 인자 전달로 바꾼다(F17 §6.3).
import { AsyncLocalStorage } from "node:async_hooks";

/** 한 요청·이벤트 처리의 공통 필드. 값이 없는 칸은 줄에 나오지 않는다. */
export type LogContextValues = {
	readonly traceId?: string;
	readonly reqId?: string;
	readonly module?: string;
	readonly usecase?: string;
};

export class LogContext {
	readonly #storage = new AsyncLocalStorage<LogContextValues>();

	/** 현재 맥락 위에 `values` 를 덮어 쓴 새 맥락에서 fn 을 돌린다 — 안쪽에서 usecase 만 더해도 trace_id 가 남는다. */
	run<T>(values: LogContextValues, fn: () => T): T {
		return this.#storage.run({ ...this.current(), ...values }, fn);
	}

	/** 맥락 밖이면 빈 객체다. */
	current(): LogContextValues {
		return this.#storage.getStore() ?? {};
	}
}
