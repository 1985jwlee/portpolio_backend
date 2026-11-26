// 오류 → 로그 필드(F17 §6.1) — `err.code`·`err.kind`·`err.stack`.
// err.kind 는 AppError.kind(클래스 이름)가 아니라 DomainError / InfraError / 그 밖으로 가른다(TD-7 7-5): 두 `kind` 는 이름만 같다.
import { AppError, DomainError, InfraError } from "@pf/kernel";

export type ErrorKind = "domain" | "infra" | "unexpected";

// 운영 로그에서 스택의 길이를 제한한다(F17 §6.1).
const STACK_LIMIT = 2_000;

export function errorKindOf(error: unknown): ErrorKind {
	if (error instanceof DomainError) {
		return "domain";
	}
	if (error instanceof InfraError) {
		return "infra";
	}
	return "unexpected";
}

/** 오류를 로그 필드로 푼다. 스택은 unexpected 일 때만 싣는다 — 예상한 오류의 스택은 소음이다. */
export function errorFields(error: unknown): Readonly<Record<string, unknown>> {
	const kind = errorKindOf(error);
	const fields: Record<string, unknown> = { "err.kind": kind };
	if (error instanceof AppError) {
		fields["err.code"] = error.code;
	}
	if (kind === "unexpected" && error instanceof Error && error.stack) {
		fields["err.stack"] = error.stack.slice(0, STACK_LIMIT);
	}
	return fields;
}
