// Result 와 이름공간 함수 시험. 공개 표면(@pf/kernel)만 임포트한다.
import { describe, expect, test } from "bun:test";
import { type AppError, NotFoundError, Result } from "@pf/kernel";

// 사례 7 — 조기 반환이 다른 성공 타입의 Result 로 그대로 흐르는지는 tsc(bun run check)가 판정한다.
function earlyReturn(r: Result<number, AppError>): Result<string, AppError> {
	if (!r.ok) {
		return r;
	}
	return Result.ok(String(r.value));
}

describe("Result", () => {
	test("ok 와 err 는 판별 값을 만든다", () => {
		const e = new NotFoundError();
		expect(Result.ok(1)).toEqual({ ok: true, value: 1 });
		expect(Result.err(e)).toEqual({ ok: false, error: e });
	});

	test("map 은 Ok 만 변환하고 Err 에서는 fn 을 부르지 않고 같은 Err 를 돌려준다", () => {
		expect(Result.map(Result.ok(2), (n) => n * 2)).toEqual({
			ok: true,
			value: 4,
		});
		let calls = 0;
		const failed = Result.err("실패");
		const out = Result.map(failed, (n: number) => {
			calls += 1;
			return n;
		});
		expect(calls).toBe(0);
		expect(out).toBe(failed);
	});

	test("mapErr 는 Err 만 변환하고 Ok 에서는 fn 을 부르지 않는다", () => {
		expect(Result.mapErr(Result.err("a"), (s) => `${s}!`)).toEqual({
			ok: false,
			error: "a!",
		});
		let calls = 0;
		const out = Result.mapErr(Result.ok(1), (s: string) => {
			calls += 1;
			return s;
		});
		expect(calls).toBe(0);
		expect(out).toEqual({ ok: true, value: 1 });
	});

	test("andThen 은 Ok 에서 fn 의 결과를 그대로 돌려주고 Err 에서는 fn 을 부르지 않는다", () => {
		const bad = Result.err("fn 실패");
		expect(Result.andThen(Result.ok(1), (n) => Result.ok(n + 1))).toEqual({
			ok: true,
			value: 2,
		});
		expect(Result.andThen(Result.ok(1), () => bad)).toBe(bad);
		let calls = 0;
		const first = Result.err("처음 실패");
		const out = Result.andThen(first, (n: number) => {
			calls += 1;
			return Result.ok(n);
		});
		expect(calls).toBe(0);
		expect(out).toBe(first);
	});

	test("unwrapOrThrow 는 Ok 의 값을 돌려준다", () => {
		expect(Result.unwrapOrThrow(Result.ok(7))).toBe(7);
	});

	test("unwrapOrThrow 는 Error 인 오류를 그 객체 그대로 던진다", () => {
		const e = new NotFoundError();
		expect(() => Result.unwrapOrThrow(Result.err(e))).toThrow(e);
	});

	test("unwrapOrThrow 는 Error 가 아닌 오류를 cause 로 담은 Error 를 던진다", () => {
		try {
			Result.unwrapOrThrow(Result.err("문자열 오류"));
			expect.unreachable();
		} catch (thrown) {
			expect(thrown).toBeInstanceOf(Error);
			expect(thrown instanceof Error && thrown.cause).toBe("문자열 오류");
		}
	});

	test("map 의 fn 이 던진 예외는 그대로 전파된다", () => {
		const boom = new Error("boom");
		expect(() =>
			Result.map(Result.ok(1), () => {
				throw boom;
			}),
		).toThrow(boom);
	});

	test("조기 반환 함수가 Ok 와 Err 를 모두 통과시킨다", () => {
		expect(earlyReturn(Result.ok(3))).toEqual({ ok: true, value: "3" });
		const e = new NotFoundError();
		expect(earlyReturn(Result.err(e))).toEqual({ ok: false, error: e });
	});
});
