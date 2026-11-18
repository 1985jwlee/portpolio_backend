// SecretString 시험 — 값이 바깥으로 나가는 모든 문자열·객체 경로에서 원값이 안 나온다(16 §7.6 ③).
// 센티널은 시험 실행 중에 만든다. 소스에 리터럴로 두면 오류 출력이 소스 줄을 찍을 때 새어 나온다.
import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { SecretString } from "@pf/config";

const sentinel = crypto.randomUUID();
const secret = new SecretString(sentinel);

describe("SecretString", () => {
	test("T1 문자열 변환 경로는 모두 ***", () => {
		expect(String(secret)).toBe("***");
		expect(`${secret}`).toBe("***");
		expect([secret].join("")).toBe("***");
		expect(secret.toString()).toBe("***");
	});

	test("T2 JSON 직렬화는 ***", () => {
		expect(JSON.stringify(secret)).toBe('"***"');
		expect(JSON.stringify({ k: secret })).toBe('{"k":"***"}');
	});

	test("T3 검사 출력 경로에 센티널이 없다", () => {
		expect(Bun.inspect({ k: secret })).not.toContain(sentinel);
		expect(inspect({ k: secret })).not.toContain(sentinel);
		expect(inspect(secret)).not.toContain(sentinel);
		// 검사 훅이 있어야 마스크가 보인다 — 훅이 없으면 값은 안 새도 `SecretString {}` 로 나온다.
		expect(Bun.inspect({ k: secret })).toContain("***");
		expect(inspect(secret)).toBe("***");
		// 훅을 끄면 인스턴스에 열거할 것이 없어야 한다 — #private 이 값을 숨긴다.
		expect(inspect(secret, { customInspect: false })).not.toContain(sentinel);
	});

	test("T4 전개·열거·복제 결과의 직렬화에 센티널이 없다", () => {
		const spread = { ...secret };
		expect(JSON.stringify(spread)).not.toContain(sentinel);
		expect(Object.keys(secret)).toEqual([]);
		expect(JSON.stringify(Object.entries(secret))).not.toContain(sentinel);
		expect(Reflect.ownKeys(secret)).toEqual([]);
		expect(JSON.stringify(structuredClone(secret))).not.toContain(sentinel);
	});

	test("T5 reveal() 은 원값을 돌려주고 인스턴스는 동결돼 있다", () => {
		expect(secret.reveal()).toBe(sentinel);
		expect(Object.isFrozen(secret)).toBe(true);
	});
});
