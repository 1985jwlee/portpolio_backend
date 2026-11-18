// 비밀 문자열을 감추고 reveal() 로만 내준다.
// 출력 경로를 막는 책임은 로더가 아니라 값 자신에 있다 — 어디로 흘러가도 원값이 나오면 안 된다.
// 환경변수·파일 읽기와 값의 해석은 이 파일의 책임이 아니다.

const MASK = "***";

export class SecretString {
	// TS private 은 런타임에서 숨기지 못한다. ECMAScript #private 이어야 전개·열거·structuredClone 에 안 잡힌다.
	readonly #value: string;

	constructor(value: string) {
		this.#value = value;
		Object.freeze(this);
	}

	reveal(): string {
		return this.#value;
	}

	toString(): string {
		return MASK;
	}

	toJSON(): string {
		return MASK;
	}

	// node:util 을 임포트하지 않는다 — Bun 에서 util.inspect.custom 이 이 전역 심볼과 같다(시험 T3 가 지킨다).
	[Symbol.for("nodejs.util.inspect.custom")](): string {
		return MASK;
	}
}
