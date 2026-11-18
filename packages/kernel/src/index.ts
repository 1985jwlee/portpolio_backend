// 공개 표면 — 이 파일이 kernel 이 내보내는 이름의 유일한 목록이다. `export *` 를 쓰지 않는다.

export type { DomainEvent, Instant, Uuid } from "./domain.ts";
export { AggregateRoot, Entity, ValueObject } from "./domain.ts";
export type { AppErrorKind, AppErrorOptions } from "./errors.ts";
export {
	APP_ERROR_TABLE,
	AppError,
	ConfigError,
	ConflictError,
	DomainError,
	DuplicateRequestError,
	ForbiddenError,
	GithubUpstreamError,
	IdempotencyKeyReuseError,
	InfraError,
	LeaseLostError,
	MigrationBehindError,
	NotFoundError,
	OverloadedError,
	PermanentError,
	RateLimitedError,
	RequestInProgressError,
	TransientError,
	UnauthenticatedError,
	ValidationError,
	VersionConflictError,
	WriteLockedError,
} from "./errors.ts";
export type { Clock } from "./ports/clock.ts";
export type { IdGenerator } from "./ports/id-generator.ts";
export type {
	CommandHandler,
	EventHandler,
	QueryHandler,
	UseCase,
} from "./ports/use-case.ts";
export type { Err, Ok } from "./result.ts";
export { Result } from "./result.ts";
