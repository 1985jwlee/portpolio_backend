// 생명주기 컴포넌트와 로그 모양 — 조립 루트가 `phase` 순으로 시작하고 역순으로 정지시키는 단위(F16 §3.7·§9.5).
import { EXIT_CODES } from "./exit-codes.ts";

export type Component = {
	readonly name: string;
	/** 시작 순서. 작을수록 먼저 시작하고 나중에 정지한다. config(0) → dbPool(10) → listener(20) → modules(30) → http(40) → readiness(50). */
	readonly phase: number;
	start(): Promise<void>;
	/** `deadlineMs` 안에 정리를 끝낸다. 넘기면 호출 쪽(ShutdownCoordinator)이 강제 종료한다. */
	stop(deadlineMs: number): Promise<void>;
};

/**
 * 생명주기가 쓰는 로그 모양 — observability 의 Logger 가 구조적으로 만족한다.
 * infra 는 modules 를 임포트할 수 없어(B7) 필요한 두 메서드만 이 자리에서 정의한다.
 */
export type LifecycleLog = {
	info(msg: string, fields?: Readonly<Record<string, unknown>>): void;
	error(msg: string, fields?: Readonly<Record<string, unknown>>): void;
};

/** 종료 코드를 실어 나르는 기동 실패 — 컴포넌트가 던지면 `exitCodeOf` 가 그 코드를 쓴다. */
export class ExitCodeError extends Error {
	readonly exitCode: number;

	constructor(
		exitCode: number,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "ExitCodeError";
		this.exitCode = exitCode;
	}
}

/** 기동 실패를 종료 코드로 바꾼다 — 코드가 없는 실패는 내부 오류 70 이다. */
export function exitCodeOf(error: unknown): number {
	return error instanceof ExitCodeError ? error.exitCode : EXIT_CODES.INTERNAL;
}

/** 로그 필드에 싣는 오류 설명 — 메시지만 낸다(스택·cause 는 싣지 않는다). */
export function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
