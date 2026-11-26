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
export type {
	AuditAction,
	AuditActorRole,
	AuditCategory,
	AuditEntry,
	AuditOutcome,
	AuditWriter,
} from "./ports/audit-writer.ts";
export type { Clock } from "./ports/clock.ts";
export type {
	EventEnvelope,
	EventTransport,
	Receive,
	Subscription,
} from "./ports/event-transport.ts";
export type { Faults } from "./ports/faults.ts";
export type { FieldCipher } from "./ports/field-cipher.ts";
export type { IdGenerator } from "./ports/id-generator.ts";
export type { KeyValueCache } from "./ports/key-value-cache.ts";
export type { PresenceCounter } from "./ports/presence-counter.ts";
export type {
	RateDecision,
	RateLimiter,
	RateRule,
} from "./ports/rate-limiter.ts";
export type {
	CommandHandler,
	EventHandler,
	QueryHandler,
	UseCase,
} from "./ports/use-case.ts";
export type { Err, Ok } from "./result.ts";
export { Result } from "./result.ts";
