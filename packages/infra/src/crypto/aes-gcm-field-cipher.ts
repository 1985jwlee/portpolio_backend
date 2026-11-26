// 필드 암호화 구현 — AES-256-GCM. 봉투 `v1.<keyId>.<base64url(iv ‖ 암호문 ‖ tag)>`, AAD 로 암호문을 행·컬럼에 묶는다(ADR-026).
// 키링 해석(keyring.ts)·DB 재암호화(S6-8)는 이 파일의 책임이 아니다. 실패는 모두 `PermanentError` 이고
// 평문·키·AAD·봉투 본문은 메시지·details·cause 어디에도 싣지 않는다 — 복호화 실패의 원인이 로그로 평문을 흘리지 않게 한다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { type FieldCipher, PermanentError } from "@pf/kernel";
import { KEY_ID_PATTERN, type Keyring } from "./keyring.ts";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

type ParsedEnvelope = { readonly keyId: string; readonly body: Buffer };

function fail(message: string, details?: Record<string, unknown>) {
	return new PermanentError(
		details === undefined ? { message } : { message, details },
	);
}

// 봉투를 나눠 형식만 본다(복호화 전). 분절 수·접두·keyId 문자·본문 길이를 엄격히 맞춘다.
function parseEnvelope(envelope: string): ParsedEnvelope {
	const parts = envelope.split(".");
	if (parts.length !== 3 || parts[0] !== VERSION) {
		throw fail("필드 봉투 형식이 맞지 않는다");
	}
	const [, keyId = "", encoded = ""] = parts;
	if (!KEY_ID_PATTERN.test(keyId)) {
		throw fail("필드 봉투 형식이 맞지 않는다");
	}
	const body = Buffer.from(encoded, "base64url");
	// Buffer 의 해석은 잘못된 문자를 건너뛰므로 되돌려 인코딩해 같은지 본다 — 비정규 표기·잡음 문자를 거부한다.
	if (
		body.toString("base64url") !== encoded ||
		body.length < IV_BYTES + TAG_BYTES
	) {
		throw fail("필드 봉투 형식이 맞지 않는다");
	}
	return { keyId, body };
}

export class AesGcmFieldCipher implements FieldCipher {
	readonly #keyring: Keyring;

	constructor(keyring: Keyring) {
		this.#keyring = keyring;
	}

	/** active 키로 암호화한다. iv 는 호출마다 CSPRNG 로 새로 뽑는다. */
	encrypt(plain: string, aad: string): string {
		const key = this.#keyring.keys.get(this.#keyring.active);
		if (key === undefined) {
			// parseKeyring 을 거친 키링이면 일어나지 않는다 — 손으로 만든 키링 방어.
			throw fail("active 키가 키링에 없다");
		}
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv(ALGORITHM, key, iv, {
			authTagLength: TAG_BYTES,
		});
		cipher.setAAD(Buffer.from(aad, "utf8"));
		const body = Buffer.concat([
			iv,
			cipher.update(plain, "utf8"),
			cipher.final(),
			cipher.getAuthTag(),
		]);
		return `${VERSION}.${this.#keyring.active}.${body.toString("base64url")}`;
	}

	/** 봉투의 keyId 로 키를 골라 복호화한다 — 키링 전체를 돌려 가며 시도하지 않는다(ADR-026). */
	decrypt(envelope: string, aad: string): string {
		const { keyId, body } = parseEnvelope(envelope);
		const key = this.#keyring.keys.get(keyId);
		if (key === undefined) {
			throw fail("봉투의 키 ID 가 키링에 없다", { keyId });
		}
		const iv = body.subarray(0, IV_BYTES);
		const tag = body.subarray(body.length - TAG_BYTES);
		const ciphertext = body.subarray(IV_BYTES, body.length - TAG_BYTES);
		try {
			const decipher = createDecipheriv(ALGORITHM, key, iv, {
				authTagLength: TAG_BYTES,
			});
			decipher.setAAD(Buffer.from(aad, "utf8"));
			decipher.setAuthTag(tag);
			return Buffer.concat([
				decipher.update(ciphertext),
				decipher.final(),
			]).toString("utf8");
		} catch {
			// 변조·AAD 불일치·키 불일치 모두 같은 오류다 — 어느 쪽인지 알려 주지 않고 원인도 싣지 않는다.
			throw fail("필드 복호화에 실패했다");
		}
	}

	/**
	 * 키 회전용 — 이미 active 키로 감싼 봉투는 입력 그대로 돌려주고(멱등), 아니면 복호화 뒤 active 로 다시 감싼다.
	 * active 봉투는 형식만 보고 복호화하지 않는다 — 검증은 읽는 쪽(`decrypt`)의 몫이다.
	 */
	rewrap(envelope: string, aad: string): string {
		const { keyId } = parseEnvelope(envelope);
		if (keyId === this.#keyring.active) {
			return envelope;
		}
		return this.encrypt(this.decrypt(envelope, aad), aad);
	}
}
