// 오류 계층과 매핑 표 시험. 기대값은 문서(00 §4.3)에서 옮겨 이 파일에 다시 적었다 —
// 코드의 APP_ERROR_TABLE 을 읽어 기대값을 만들면 표가 틀려도 시험이 통과한다.
import { describe, expect, test } from "bun:test";
import * as kernel from "@pf/kernel";
import {
	APP_ERROR_TABLE,
	AppError,
	type AppErrorKind,
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
} from "@pf/kernel";

type Row = {
	readonly kind: AppErrorKind;
	readonly make: () => AppError;
	readonly isParent: (e: unknown) => boolean;
	readonly side: "domain" | "infra";
	readonly httpStatus: number;
	readonly code: string;
	readonly retryable: boolean;
};

const ROWS: readonly Row[] = [
	{
		kind: "ValidationError",
		make: () => new ValidationError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 400,
		code: "validation_failed",
		retryable: false,
	},
	{
		kind: "UnauthenticatedError",
		make: () => new UnauthenticatedError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 401,
		code: "unauthenticated",
		retryable: false,
	},
	{
		kind: "ForbiddenError",
		make: () => new ForbiddenError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 403,
		code: "forbidden",
		retryable: false,
	},
	{
		kind: "NotFoundError",
		make: () => new NotFoundError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 404,
		code: "not_found",
		retryable: false,
	},
	{
		kind: "ConflictError",
		make: () => new ConflictError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 409,
		code: "conflict",
		retryable: false,
	},
	{
		kind: "VersionConflictError",
		make: () => new VersionConflictError(),
		isParent: (e) => e instanceof ConflictError,
		side: "domain",
		httpStatus: 409,
		code: "version_conflict",
		retryable: false,
	},
	{
		kind: "DuplicateRequestError",
		make: () => new DuplicateRequestError(),
		isParent: (e) => e instanceof ConflictError,
		side: "domain",
		httpStatus: 409,
		code: "duplicate_request",
		retryable: false,
	},
	{
		kind: "RequestInProgressError",
		make: () => new RequestInProgressError(),
		isParent: (e) => e instanceof ConflictError,
		side: "domain",
		httpStatus: 409,
		code: "request_in_progress",
		retryable: false,
	},
	{
		kind: "IdempotencyKeyReuseError",
		make: () => new IdempotencyKeyReuseError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 422,
		code: "idempotency_key_reuse",
		retryable: false,
	},
	{
		kind: "RateLimitedError",
		make: () => new RateLimitedError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 429,
		code: "rate_limited",
		retryable: false,
	},
	{
		kind: "WriteLockedError",
		make: () => new WriteLockedError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 503,
		code: "write_locked",
		retryable: false,
	},
	{
		kind: "OverloadedError",
		make: () => new OverloadedError(),
		isParent: (e) => e instanceof DomainError,
		side: "domain",
		httpStatus: 503,
		code: "overloaded",
		retryable: false,
	},
	{
		kind: "TransientError",
		make: () => new TransientError(),
		isParent: (e) => e instanceof InfraError,
		side: "infra",
		httpStatus: 503,
		code: "unavailable",
		retryable: true,
	},
	{
		kind: "LeaseLostError",
		make: () => new LeaseLostError(),
		isParent: (e) => e instanceof TransientError,
		side: "infra",
		httpStatus: 503,
		code: "lease_lost",
		retryable: false,
	},
	{
		kind: "PermanentError",
		make: () => new PermanentError(),
		isParent: (e) => e instanceof InfraError,
		side: "infra",
		httpStatus: 500,
		code: "internal",
		retryable: false,
	},
	{
		kind: "ConfigError",
		make: () => new ConfigError(),
		isParent: (e) => e instanceof PermanentError,
		side: "infra",
		httpStatus: 500,
		code: "config_invalid",
		retryable: false,
	},
	{
		kind: "MigrationBehindError",
		make: () => new MigrationBehindError(),
		isParent: (e) => e instanceof PermanentError,
		side: "infra",
		httpStatus: 500,
		code: "migration_behind",
		retryable: false,
	},
	{
		kind: "GithubUpstreamError",
		make: () => new GithubUpstreamError({ code: "github_unavailable" }),
		isParent: (e) => e instanceof InfraError,
		side: "infra",
		httpStatus: 502,
		code: "github_unavailable",
		retryable: true,
	},
];

describe("오류 클래스", () => {
	test.each(ROWS)("$kind 는 표의 값과 부모 갈래를 갖는다", (row) => {
		const e = row.make();
		expect(e.kind).toBe(row.kind);
		expect(e.name).toBe(row.kind);
		expect(e.httpStatus).toBe(row.httpStatus);
		expect(e.code).toBe(row.code);
		expect(e.retryable).toBe(row.retryable);
		expect(row.isParent(e)).toBe(true);
		expect(
			e instanceof (row.side === "domain" ? DomainError : InfraError),
		).toBe(true);
		expect(e instanceof AppError).toBe(true);
		expect(e instanceof Error).toBe(true);
	});

	test("APP_ERROR_TABLE 의 키 집합과 값이 기대표와 같다", () => {
		expect(Object.keys(APP_ERROR_TABLE).sort()).toEqual(
			ROWS.map((r) => r.kind).sort(),
		);
		for (const row of ROWS) {
			const actual = APP_ERROR_TABLE[row.kind];
			expect(actual).toEqual({
				httpStatus: row.httpStatus,
				code: row.code,
				retryable: row.retryable,
			});
		}
		// 타입 수준 시험 — 실행하지 않는다. 표가 읽기 전용이 아니면 아래 @ts-expect-error 가 쓰이지 않아 tsc 가 실패한다.
		const tryWrite = (): void => {
			// @ts-expect-error 표는 읽기 전용이다
			APP_ERROR_TABLE.NotFoundError.httpStatus = 404;
		};
		void tryWrite;
	});

	test("공개된 AppError 하위 클래스 전부의 kind 가 기대표와 일치하고 서로 겹치지 않는다", () => {
		const abstractNames = new Set(["AppError", "DomainError", "InfraError"]);
		const kinds: string[] = [];
		for (const [name, value] of Object.entries(kernel)) {
			if (abstractNames.has(name) || typeof value !== "function") {
				continue;
			}
			if (!(value.prototype instanceof AppError)) {
				continue;
			}
			// kind 접근자는 상수를 돌려주므로 프로토타입에서 읽는다(추상 클래스는 인스턴스를 만들 수 없는 이름이라 제외했다).
			const kind: unknown = Reflect.get(value.prototype, "kind");
			expect(kind).toBe(name);
			kinds.push(String(kind));
		}
		expect(new Set(kinds).size).toBe(kinds.length);
		expect(kinds.sort()).toEqual(ROWS.map((r) => r.kind).sort());
	});

	test("code 를 주면 코드만 바뀌고 상태와 kind 는 클래스를 따른다", () => {
		const e = new ForbiddenError({ code: "origin_mismatch" });
		expect(e.code).toBe("origin_mismatch");
		expect(e.httpStatus).toBe(403);
		expect(e.kind).toBe("ForbiddenError");
	});

	test("kind 를 덮지 않은 하위 클래스는 가장 가까운 kernel 조상의 값을 물려받는다", () => {
		class ModuleConflict extends ConflictError {}
		const e = new ModuleConflict();
		expect(e.kind).toBe("ConflictError");
		expect(e.httpStatus).toBe(409);
		expect(e.code).toBe("conflict");
	});

	test("GithubUpstreamError 는 code 로 재시도 여부를 정하고 둘 다 502 다", () => {
		const down = new GithubUpstreamError({ code: "github_unavailable" });
		const rejected = new GithubUpstreamError({ code: "github_rejected" });
		expect(down.retryable).toBe(true);
		expect(rejected.retryable).toBe(false);
		expect(down.httpStatus).toBe(502);
		expect(rejected.httpStatus).toBe(502);
	});

	test("cause 를 주면 같은 참조로 보존하고 안 주면 속성이 없다", () => {
		const root = new Error("원인");
		expect(new NotFoundError({ cause: root }).cause).toBe(root);
		expect("cause" in new NotFoundError()).toBe(false);
	});

	test("message 기본값은 code 이고 details 는 준 그대로이거나 undefined 다", () => {
		const plain = new NotFoundError();
		expect(plain.message).toBe("not_found");
		expect(plain.details).toBeUndefined();
		const detail = { id: 1 };
		const given = new NotFoundError({ message: "없다", details: detail });
		expect(given.message).toBe("없다");
		expect(given.details).toBe(detail);
	});

	test("message 는 옵션 유무와 관계없이 열거되지 않는다(Error 의 표준)", () => {
		const plain = Object.getOwnPropertyDescriptor(
			new NotFoundError(),
			"message",
		);
		const given = Object.getOwnPropertyDescriptor(
			new NotFoundError({ message: "없다" }),
			"message",
		);
		expect(plain?.enumerable).toBe(false);
		expect(given?.enumerable).toBe(false);
	});
});
