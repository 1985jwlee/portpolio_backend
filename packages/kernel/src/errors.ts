// 오류 분류(클래스 계층)와 클래스 → httpStatus·code·retryable 데이터 표.
// 응답 생성·메시지 카탈로그·헤더는 이 파일의 책임이 아니다.

export type AppErrorKind =
	| "ValidationError"
	| "UnauthenticatedError"
	| "ForbiddenError"
	| "NotFoundError"
	| "ConflictError"
	| "VersionConflictError"
	| "DuplicateRequestError"
	| "RequestInProgressError"
	| "IdempotencyKeyReuseError"
	| "RateLimitedError"
	| "WriteLockedError"
	| "OverloadedError"
	| "TransientError"
	| "LeaseLostError"
	| "PermanentError"
	| "ConfigError"
	| "MigrationBehindError"
	| "GithubUpstreamError";

type ErrorRow = {
	readonly httpStatus: number;
	readonly code: string;
	readonly retryable: boolean;
};

// 오류 매핑의 유일한 정본이다. 키가 AppErrorKind 전수라 행이 빠지면 tsc 가 실패한다.
// retryable 은 "시스템(워커·재시도 정책)이 같은 작업을 자동으로 다시 시도해도 되는가"이고,
// 클라이언트 재시도 안내(Retry-After)는 이 표의 몫이 아니다.
// 요청 경로에서 나지 않는 오류(DuplicateRequest·Config·MigrationBehind)는 부모의 값을 갖는다.
export const APP_ERROR_TABLE: { readonly [K in AppErrorKind]: ErrorRow } = {
	ValidationError: {
		httpStatus: 400,
		code: "validation_failed",
		retryable: false,
	},
	UnauthenticatedError: {
		httpStatus: 401,
		code: "unauthenticated",
		retryable: false,
	},
	ForbiddenError: { httpStatus: 403, code: "forbidden", retryable: false },
	NotFoundError: { httpStatus: 404, code: "not_found", retryable: false },
	ConflictError: { httpStatus: 409, code: "conflict", retryable: false },
	VersionConflictError: {
		httpStatus: 409,
		code: "version_conflict",
		retryable: false,
	},
	DuplicateRequestError: {
		httpStatus: 409,
		code: "duplicate_request",
		retryable: false,
	},
	RequestInProgressError: {
		httpStatus: 409,
		code: "request_in_progress",
		retryable: false,
	},
	IdempotencyKeyReuseError: {
		httpStatus: 422,
		code: "idempotency_key_reuse",
		retryable: false,
	},
	RateLimitedError: { httpStatus: 429, code: "rate_limited", retryable: false },
	WriteLockedError: { httpStatus: 503, code: "write_locked", retryable: false },
	OverloadedError: { httpStatus: 503, code: "overloaded", retryable: false },
	TransientError: { httpStatus: 503, code: "unavailable", retryable: true },
	LeaseLostError: { httpStatus: 503, code: "lease_lost", retryable: false },
	PermanentError: { httpStatus: 500, code: "internal", retryable: false },
	ConfigError: { httpStatus: 500, code: "config_invalid", retryable: false },
	MigrationBehindError: {
		httpStatus: 500,
		code: "migration_behind",
		retryable: false,
	},
	GithubUpstreamError: {
		httpStatus: 502,
		code: "github_unavailable",
		retryable: true,
	},
};

export type AppErrorOptions = {
	readonly message?: string;
	readonly code?: string;
	readonly details?: unknown;
	readonly cause?: unknown;
};

export abstract class AppError extends Error {
	// kind 는 프로토타입 수준(하위 클래스의 접근자)에 둔다.
	// 인스턴스 필드는 super() 뒤에 초기화되므로 이 생성자에서 읽을 수 없다.
	abstract get kind(): AppErrorKind;
	readonly code: string;
	readonly httpStatus: number;
	readonly retryable: boolean;
	readonly details: unknown;

	constructor(options?: AppErrorOptions) {
		// 추상 접근자는 생성자에서 this 로 못 읽는다(TS2715). 접근자가 상수를 돌려주므로 프로토타입으로 읽는다.
		const kind = new.target.prototype.kind;
		const row = APP_ERROR_TABLE[kind];
		// code 는 메시지 기본값이라 super 앞에서 구한다. 메시지를 대입으로 만들면 message 의 열거 여부가 옵션 유무에 따라 갈린다.
		const code = options?.code ?? row.code;
		// cause 키가 있을 때만 넘긴다 — 안 준 오류에 cause 속성이 생기면 안 된다.
		super(
			options?.message ?? code,
			options !== undefined && "cause" in options
				? { cause: options.cause }
				: undefined,
		);
		this.name = kind;
		this.code = code;
		this.httpStatus = row.httpStatus;
		this.retryable = this.isRetryable(this.code);
		this.details = options?.details;
	}

	// 코드에 따라 재시도 여부가 갈리는 하위 클래스가 덮어쓴다. 기반 생성자 안에서 불리므로 인자(code)만 보고 인스턴스 필드를 읽지 않는다.
	protected isRetryable(_code: string): boolean {
		return APP_ERROR_TABLE[this.kind].retryable;
	}
}

export abstract class DomainError extends AppError {}

export abstract class InfraError extends AppError {}

export class ValidationError extends DomainError {
	override get kind(): AppErrorKind {
		return "ValidationError";
	}
}

export class UnauthenticatedError extends DomainError {
	override get kind(): AppErrorKind {
		return "UnauthenticatedError";
	}
}

export class ForbiddenError extends DomainError {
	override get kind(): AppErrorKind {
		return "ForbiddenError";
	}
}

export class NotFoundError extends DomainError {
	override get kind(): AppErrorKind {
		return "NotFoundError";
	}
}

export class ConflictError extends DomainError {
	override get kind(): AppErrorKind {
		return "ConflictError";
	}
}

export class VersionConflictError extends ConflictError {
	override get kind(): AppErrorKind {
		return "VersionConflictError";
	}
}

export class DuplicateRequestError extends ConflictError {
	override get kind(): AppErrorKind {
		return "DuplicateRequestError";
	}
}

export class RequestInProgressError extends ConflictError {
	override get kind(): AppErrorKind {
		return "RequestInProgressError";
	}
}

export class IdempotencyKeyReuseError extends DomainError {
	override get kind(): AppErrorKind {
		return "IdempotencyKeyReuseError";
	}
}

export class RateLimitedError extends DomainError {
	override get kind(): AppErrorKind {
		return "RateLimitedError";
	}
}

export class WriteLockedError extends DomainError {
	override get kind(): AppErrorKind {
		return "WriteLockedError";
	}
}

export class OverloadedError extends DomainError {
	override get kind(): AppErrorKind {
		return "OverloadedError";
	}
}

export class TransientError extends InfraError {
	override get kind(): AppErrorKind {
		return "TransientError";
	}
}

export class LeaseLostError extends TransientError {
	override get kind(): AppErrorKind {
		return "LeaseLostError";
	}
}

export class PermanentError extends InfraError {
	override get kind(): AppErrorKind {
		return "PermanentError";
	}
}

export class ConfigError extends PermanentError {
	override get kind(): AppErrorKind {
		return "ConfigError";
	}
}

export class MigrationBehindError extends PermanentError {
	override get kind(): AppErrorKind {
		return "MigrationBehindError";
	}
}

export class GithubUpstreamError extends InfraError {
	constructor(
		options: { readonly code: "github_unavailable" | "github_rejected" } & Omit<
			AppErrorOptions,
			"code"
		>,
	) {
		super(options);
	}

	override get kind(): AppErrorKind {
		return "GithubUpstreamError";
	}

	// 일시 장애만 재시도하고, 거절은 다시 해도 같다.
	protected override isRetryable(code: string): boolean {
		return code === "github_unavailable";
	}
}
