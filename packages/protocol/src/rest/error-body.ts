import { type Static, Type } from "@sinclair/typebox";

// 오류 응답 본문의 공용 봉투(03 §1·F16 §6.2). 모듈별 오류 코드는 와이어에서 접두사를 뗀 문자열이다.
export const ErrorBody = Type.Object({
	error: Type.Object({
		code: Type.String({ minLength: 1 }),
		message: Type.String(),
		traceId: Type.String({ format: "uuid" }),
		details: Type.Optional(Type.Unknown()),
	}),
});

export type ErrorBody = Static<typeof ErrorBody>;
