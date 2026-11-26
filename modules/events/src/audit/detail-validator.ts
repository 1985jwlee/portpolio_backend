// 감사 `detail` 검증 — 본문·IP·토큰·메모가 감사 표로 새지 않게 쓰기 앞에서 막는 1차선(F13 EV-14, ADR-027).
// `Redactor` 2차선(로그)과 별개이고, 값의 의미(고정 열거·형식)는 보지 않는다. 위반은 프로그래밍 오류라 `PermanentError` 다.
// 한계: 금지 키는 이름 일치(대소문자 무시)만 본다 — `ip_address`·`accessToken` 같은 변형·부분 일치는 막지 못한다.
//   문서(F13:1825)의 금지 키 목록 5개가 전부이고 허용 키 화이트리스트는 두지 않는다(목록이 "등"으로 끝나 미완).
import { PermanentError } from "@pf/kernel";

/** 키 한 개당 값 문자열의 상한(UTF-16 코드 단위). */
export const DETAIL_MAX_STRING_LENGTH = 200;
/** 한 detail 의 키 수 상한. */
export const DETAIL_MAX_KEYS = 16;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
	"body",
	"note",
	"token",
	"ip",
	"cookie",
]);

// 오류에는 키 이름과 길이·개수만 싣는다 — 값은 본문·토큰일 수 있어 어떤 경로로도 싣지 않는다.
function reject(message: string, details: Record<string, unknown>): never {
	throw new PermanentError({
		message: `감사 detail 이 올바르지 않다: ${message}`,
		details,
	});
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	// Date·Map 같은 클래스 인스턴스는 열거 가능한 키가 없어 빈 객체로 통과해 버리므로 프로토타입으로 거른다.
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function checkValue(key: string, value: unknown): void {
	switch (typeof value) {
		case "string":
			if (value.length > DETAIL_MAX_STRING_LENGTH) {
				reject(`문자열 값은 ${DETAIL_MAX_STRING_LENGTH}자 이하여야 한다`, {
					key,
					length: value.length,
				});
			}
			return;
		case "number":
			// NaN·Infinity 는 jsonb 로 직렬화되지 않는다.
			if (!Number.isFinite(value)) {
				reject("숫자 값은 유한해야 한다", { key });
			}
			return;
		case "boolean":
			return;
		case "object":
			if (value !== null) {
				reject(
					"값은 문자열·숫자·불리언·null 이어야 한다(중첩 객체·배열 금지)",
					{
						key,
					},
				);
			}
			return;
		default:
			reject("값은 문자열·숫자·불리언·null 이어야 한다", {
				key,
				type: typeof value,
			});
	}
}

export class DetailValidator {
	/** 규칙을 어기면 `PermanentError` 를 던진다. 통과하면 아무것도 돌려주지 않는다. */
	check(detail: unknown): void {
		if (!isPlainObject(detail)) {
			reject("detail 은 평면 객체여야 한다", {});
		}
		const keys = Object.keys(detail);
		if (keys.length > DETAIL_MAX_KEYS) {
			reject(`키는 ${DETAIL_MAX_KEYS}개 이하여야 한다`, {
				keyCount: keys.length,
			});
		}
		for (const key of keys) {
			if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
				reject("금지된 키다", { key });
			}
			checkValue(key, detail[key]);
		}
	}
}
