// 키링 해석 — `{ active, keys }` 를 검증해 키 바이트로 바꾼다. 암호화는 이 파일의 책임이 아니다.
// 오류에는 키 이름(keyId)만 싣는다 — 키 값·원문은 메시지·details·cause 어디에도 넣지 않는다(ADR-026).
import { ConfigError, Result } from "@pf/kernel";

/** 키 ID 형식 — 봉투의 keyId 분절과 같은 규칙이다. */
export const KEY_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

// 32바이트의 표준 base64 는 정확히 43자 + `=` 하나다. Buffer 의 base64 해석은 잘못된 문자를 조용히 건너뛰어 엄격 검사에 못 쓴다.
const KEY_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const KEY_BYTES = 32;

export type Keyring = {
	readonly active: string;
	readonly keys: ReadonlyMap<string, Uint8Array>;
};

function fail(message: string, details?: Record<string, unknown>) {
	return Result.err(
		new ConfigError(details === undefined ? { message } : { message, details }),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 키링 원문을 검증한다. 문자열이면 JSON 으로 읽는다(환경변수·시크릿 파일은 문자열이다).
 * JSON 오류의 내용은 원문 조각을 담을 수 있어 싣지 않는다.
 */
export function parseKeyring(raw: unknown): Result<Keyring, ConfigError> {
	let value = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return fail("키링이 JSON 이 아니다");
		}
	}
	if (!isRecord(value)) {
		return fail("키링은 { active, keys } 객체여야 한다");
	}
	const { active, keys } = value;
	if (typeof active !== "string" || !KEY_ID_PATTERN.test(active)) {
		return fail("키링 active 는 키 ID 형식의 문자열이어야 한다");
	}
	if (!isRecord(keys) || Object.keys(keys).length === 0) {
		return fail("키링 keys 는 키를 하나 이상 가진 객체여야 한다");
	}

	const decoded = new Map<string, Uint8Array>();
	for (const [keyId, encoded] of Object.entries(keys)) {
		if (!KEY_ID_PATTERN.test(keyId)) {
			// 형식이 틀린 이름은 되돌려 싣지 않는다 — 값이 잘못 이름 자리에 들어갔을 수 있다.
			return fail("키링의 키 ID 형식이 맞지 않는다");
		}
		if (typeof encoded !== "string" || !KEY_BASE64_PATTERN.test(encoded)) {
			return fail("키링의 키는 32바이트 base64 여야 한다", { keyId });
		}
		const bytes = Buffer.from(encoded, "base64");
		if (bytes.length !== KEY_BYTES) {
			return fail("키링의 키는 32바이트 base64 여야 한다", { keyId });
		}
		decoded.set(keyId, new Uint8Array(bytes));
	}
	if (!decoded.has(active)) {
		return fail("키링 active 가 keys 에 없다", { active });
	}
	return Result.ok({ active, keys: decoded });
}
