// 성공/실패를 값으로 운반하는 결과 타입과 그것을 잇는 함수.
// 비동기 합성·예외 포착은 이 파일의 책임이 아니다.

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

function err<E>(error: E): Err<E> {
	return { ok: false, error };
}

// Err 는 성공 타입을 갖지 않으므로 받은 Err 를 그대로 돌려줘도 타입이 맞는다.
function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

function mapErr<T, E, F>(
	result: Result<T, E>,
	fn: (error: E) => F,
): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

// fn 의 결과를 다시 감싸지 않고 그대로 돌려준다.
function andThen<T, U, E, F>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
	return result.ok ? fn(result.value) : result;
}

/**
 * Ok 면 값을, Err 면 오류를 던진다. 시험·조립 루트 전용 — usecase 는 쓰지 않는다.
 */
function unwrapOrThrow<T, E>(result: Result<T, E>): T {
	if (result.ok) {
		return result.value;
	}
	if (result.error instanceof Error) {
		throw result.error;
	}
	throw new Error("Result.unwrapOrThrow: Err", { cause: result.error });
}

// 타입 `Result` 와 같은 이름의 값으로 함수들을 묶는다 — `Result.err(...)` 표기를 위해서다.
export const Result = { ok, err, map, mapErr, andThen, unwrapOrThrow };
