import { type Static, Type } from "@sinclair/typebox";

// 클라이언트 → 서버 연결 관리 메시지(04 §2·§3.1). 서버가 `MessageCodec` 에서 이 스키마로 검증한다(ADR-053).
// 클라이언트 프레임에는 서버 전용 필드(`seq`·`sk`·`ts`)가 없다.
export const WS_PROTOCOL_VERSION = 1;

const SysFrame = {
	v: Type.Literal(WS_PROTOCOL_VERSION),
	ch: Type.Literal("sys"),
};

export const ClientHello = Type.Object({
	...SysFrame,
	t: Type.Literal("hello"),
	d: Type.Object({
		resume: Type.Optional(Type.Integer({ minimum: 0 })),
		locale: Type.Union([Type.Literal("ko"), Type.Literal("en")]),
	}),
});

export const ClientPing = Type.Object({
	...SysFrame,
	t: Type.Literal("ping"),
	d: Type.Object({ n: Type.Integer({ minimum: 0 }) }),
});

export type ClientHello = Static<typeof ClientHello>;
export type ClientPing = Static<typeof ClientPing>;
