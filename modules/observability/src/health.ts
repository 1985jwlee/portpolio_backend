// 헬스 검사 레지스트리(F17 §5) — `/healthz`(살아 있음)와 `/readyz`(트래픽을 받을 수 있음)의 판정.
// 검사 구현 중 DB 에 닿는 것은 각 앱의 조립(compose)이 포트를 꽂아 만든다 — 이 모듈은 DB 를 모른다.

export type CheckResult = {
	readonly status: "ok" | "fail";
	/** 짧은 문구만 — 비밀·연결 문자열·내부 주소를 넣지 않는다(F17 §5). */
	readonly detail?: string;
};

export interface HealthCheck {
	readonly name: string;
	/** 참인 검사가 하나라도 실패하면 readiness 가 503 이다. 거짓이면 `degraded` 로만 표시한다. */
	readonly critical: boolean;
	run(): Promise<CheckResult>;
}

export type HealthStatus = "ok" | "degraded" | "fail";

export type HealthReport = {
	readonly status: HealthStatus;
	readonly version: string;
	readonly checks: Readonly<Record<string, CheckResult>>;
};

const DRAINING = "draining";

async function runCheck(check: HealthCheck): Promise<CheckResult> {
	try {
		return await check.run();
	} catch {
		// 예외 메시지는 연결 문자열 등을 품을 수 있어 본문에 싣지 않는다.
		return { status: "fail", detail: "check threw" };
	}
}

async function evaluate(
	version: string,
	checks: readonly HealthCheck[],
	draining: boolean,
): Promise<HealthReport> {
	const entries: Record<string, CheckResult> = {};
	let status: HealthStatus = "ok";
	if (draining) {
		entries[DRAINING] = { status: "fail", detail: "shutting down" };
		status = "fail";
	}
	const results = await Promise.all(checks.map(runCheck));
	checks.forEach((check, index) => {
		const result = results[index];
		if (result === undefined) {
			return;
		}
		entries[check.name] = result;
		if (result.status === "ok") {
			return;
		}
		if (check.critical) {
			status = "fail";
		} else if (status === "ok") {
			status = "degraded";
		}
	});
	return { status, version, checks: entries };
}

export class HealthRegistry {
	readonly #version: string;
	readonly #readiness: HealthCheck[] = [];
	readonly #liveness: HealthCheck[] = [];
	#draining = false;

	constructor(version: string) {
		this.#version = version;
	}

	/** readyz 의 검사로 등록한다. */
	register(check: HealthCheck): void {
		this.#readiness.push(check);
	}

	/** healthz 의 검사로 등록한다 — 없으면 healthz 는 프로세스가 응답하는 것만 본다(DV-029). */
	registerLiveness(check: HealthCheck): void {
		this.#liveness.push(check);
	}

	/** 종료 신호 뒤나 기동 완료 전에는 참이다 — readyz 가 503 이 되어 새 트래픽에서 빠진다. healthz 는 영향받지 않는다. */
	setDraining(flag: boolean): void {
		this.#draining = flag;
	}

	liveness(): Promise<HealthReport> {
		return evaluate(this.#version, this.#liveness, false);
	}

	readiness(): Promise<HealthReport> {
		return evaluate(this.#version, this.#readiness, this.#draining);
	}
}

/** 보고서를 HTTP 상태로 — `fail` 만 503 이고 `degraded` 는 트래픽을 받는다(F17 §5.1). */
export function httpStatusOf(report: HealthReport): 200 | 503 {
	return report.status === "fail" ? 503 : 200;
}
