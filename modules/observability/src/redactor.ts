// 로그 마스킹(F17 §6.2) — 거부목록 키와 값 패턴을 `[redacted]` 로 바꾼다. 금지 데이터를 애초에 넘기지 않는 것이 1차선이고
// 이 클래스는 실수를 막는 2차선이다. 치환이 일어나면 횟수가 올라가 "누가 금지 데이터를 넘기고 있음" 이 드러난다(0 이 정상).

export const REDACTED = "[redacted]";
export const CIRCULAR = "[circular]";
export const TOO_DEEP = "[depth]";

// 깊이 8 을 넘는 컨테이너는 내려가지 않는다(루트가 0).
const MAX_DEPTH = 8;

// 키 거부목록 15개 — 대소문자를 무시하고 키 이름 전체가 같을 때만 건다(부분 일치가 아니다).
const DENY_KEYS: ReadonlySet<string> = new Set([
	"authorization",
	"cookie",
	"set-cookie",
	"token",
	"access_token",
	"secret",
	"password",
	"client_secret",
	"x-forwarded-for",
	"x-real-ip",
	"cf-connecting-ip",
	"body",
	"payload",
	"displayname",
	"display_name",
]);

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";

// 값 패턴은 문자열 안에서 일치한 부분만 바꾼다 — 나머지 문맥은 남겨 원인 추적이 가능하게 한다.
// 순서가 의미를 가진다: 연결 문자열(자격 증명을 품은 URL 전체) → Bearer → 긴 토큰 → IPv6 → IPv4.
const VALUE_PATTERNS: readonly RegExp[] = [
	// scheme://user:pass@host... — 자격 증명뿐 아니라 내부 주소도 담고 있어 토큰 전체를 가린다.
	/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@\S*/gi,
	/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
	// 32바이트의 base64url 은 43자 — 그 이상 이어지는 문자 열은 토큰으로 본다.
	/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43,}(?![A-Za-z0-9_-])/g,
	// IPv6 — 전체 8그룹 또는 `::` 압축형. 시각(12:34:56)처럼 `::` 도 8그룹도 아닌 것은 걸리지 않는다.
	/(?<![\w:.])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?)(?![\w:])/gi,
	new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?![\\d.])`, "g"),
];

export class Redactor {
	#count = 0;

	/** 지금까지 치환한 횟수(키 거부 + 값 패턴 일치). 지표(`pf_log_redactions_total`)는 범위 밖이라 메서드로만 준다. */
	redactionCount(): number {
		return this.#count;
	}

	/** 값을 마스킹한 사본을 돌려준다. 원본은 바꾸지 않는다. */
	redact(value: unknown): unknown {
		return this.#walk(value, [], 0);
	}

	#scrub(text: string): string {
		let result = text;
		for (const pattern of VALUE_PATTERNS) {
			result = result.replace(pattern, () => {
				this.#count += 1;
				return REDACTED;
			});
		}
		return result;
	}

	// ancestors 는 지금 내려가는 경로다 — 같은 객체를 두 곳에서 참조하는 것은 순환이 아니므로 경로만 본다.
	#walk(value: unknown, ancestors: readonly object[], depth: number): unknown {
		switch (typeof value) {
			case "string":
				return this.#scrub(value);
			case "bigint":
				return value.toString();
			case "function":
			case "symbol":
			case "undefined":
				return undefined;
			case "object":
				break;
			default:
				return value;
		}
		if (value === null) {
			return null;
		}
		if (value instanceof Date) {
			return Number.isNaN(value.getTime()) ? null : value.toISOString();
		}
		if (ancestors.includes(value)) {
			return CIRCULAR;
		}
		if (depth > MAX_DEPTH) {
			return TOO_DEEP;
		}
		const path = [...ancestors, value];
		if (value instanceof Error) {
			// 스택은 싣지 않는다 — err.stack 은 로거가 unexpected 일 때만 따로 낸다.
			return {
				name: value.name,
				message: this.#scrub(value.message),
			};
		}
		if (Array.isArray(value)) {
			return value.map((item) => this.#walk(item, path, depth + 1));
		}
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => {
				if (DENY_KEYS.has(key.toLowerCase())) {
					this.#count += 1;
					return [key, REDACTED];
				}
				return [key, this.#walk(item, path, depth + 1)];
			}),
		);
	}
}
