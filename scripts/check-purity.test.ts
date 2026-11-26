// 소스 규칙(check-purity) 시험 — 메모리 입력만 쓴다. 파일·네트워크·시계를 읽지 않는다.
import { describe, expect, test } from "bun:test";
import { PURITY_RULE_IDS, scanPurity } from "./check-purity.ts";

const rules = (path: string, text: string) =>
	scanPurity(path, text).map((v) => `${v.rule}:${v.line}`);

/** 기대와 다른 결과를 낸 입력만 모은다 — 빨강일 때 어느 입력이 틀렸는지가 실패 값에 그대로 나온다. */
const wrong = (
	path: string,
	texts: readonly string[],
	expected: readonly string[],
) => texts.filter((text) => rules(path, text).join() !== expected.join());

const USECASE = "modules/m/src/usecase/x.ts";

describe("B9-env 환경 접근", () => {
	test("제품 소스의 process.env·Bun.env·import.meta.env 를 줄 번호와 함께 잡는다", () => {
		const text = [
			"const a = process.env.A;",
			"const b = Bun.env.B;",
			"const c = import.meta.env.C;",
		].join("\n");
		expect(rules("modules/m/src/service/x.ts", text)).toEqual([
			"B9-env:1",
			"B9-env:2",
			"B9-env:3",
		]);
	});

	test("process·Bun 의 ?.·[ 접근도 속성이 env 면 잡는다", () => {
		const lines = [
			"const v = process?.env?.X;",
			'const v = process["env"].X;',
			'const v = process?.["env"];',
			'const v = Bun["env"].X;',
			"const v = Bun?.env?.X;",
			'const v = Bun?.["env"];',
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("구조분해로 env 를 꺼내는 표기를 잡는다 — 별칭·기본값·중첩·globalThis 경유 포함", () => {
		const lines = [
			"const { env } = process;",
			"const { env: e } = process;",
			"const { env = {} } = process;",
			"const { argv, env } = process;",
			"const { env: { X } } = process;",
			"const { env: { DB: { URL } } } = Bun;",
			"const { env } = Bun;",
			"const { env } = globalThis.process;",
			"const { env } = globalThis.Bun;",
			"({ env } = process);",
			"function f({ env } = process) {}",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("bun 에서 env 를 명명 임포트하는 표기를 잡는다", () => {
		const lines = [
			'import { env } from "bun";',
			'import { serve, env as E } from "bun";',
			'export { env } from "bun";',
			"import { env } from 'bun';",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("포매터가 여러 줄로 나눈 구조분해·임포트도 매치가 시작한 줄로 잡는다", () => {
		// Biome 가 80 칸을 넘는 구조분해·임포트를 실제로 이렇게 나눈다.
		expect(rules(USECASE, "const {\n\tenv,\n\targv,\n} = process;")).toEqual([
			"B9-env:1",
		]);
		expect(
			rules(USECASE, "const {\n\tenv: {\n\t\tDB: { URL },\n\t},\n} = Bun;"),
		).toEqual(["B9-env:1"]);
		expect(
			rules(USECASE, 'import {\n\tserve,\n\tenv,\n\tfile,\n} from "bun";'),
		).toEqual(["B9-env:1"]);
		// 앞 문장이 있으면 시작 줄이 밀리고, CRLF 도 줄 수를 바꾸지 않는다.
		expect(
			rules(USECASE, "const a = 1;\r\nconst {\r\n\tenv,\r\n} = process;\r\n"),
		).toEqual(["B9-env:2"]);
	});

	test("환경과 무관한 표기는 잡지 않는다", () => {
		const lines = [
			'import { serve } from "bun";',
			"const environment = 1;",
			"process.exitCode = 1;",
			"const { a } = obj;",
			'import { envelope } from "./x";',
			"const { argv } = process;",
			"const { serve } = Bun;",
			"const { a: { b } } = process;",
			"const { a: env } = process;",
			"const { a: { env } } = process;",
			"const { environment } = process;",
		];
		expect(wrong(USECASE, lines, [])).toEqual([]);
	});

	test("줄을 넘어 이웃 문장을 이어 붙이지 않는다", () => {
		const cases = [
			// 매개변수의 env 와 뒤따르는 다른 구조분해를 한 구조분해로 잇지 않는다
			"function f({ env }: Opts) {\n\tconst { argv } = process;\n}",
			// 주석의 env 와 뒤의 bun 임포트
			'// env 설정은 config 에서만 읽는다\nimport { serve } from "bun";',
			"const {\n\targv,\n\tplatform,\n} = process;",
			'import {\n\tserve,\n\tfile,\n} from "bun";',
			// 세미콜론 없는 앞 문장의 env 객체
			"const a = { env: 1 }\nconst { b } = process",
			'import { serve } from "bun";\nimport { env } from "./config";',
		];
		expect(wrong(USECASE, cases, [])).toEqual([]);
	});

	test("문서에 적은 한계 — AST 로도 못 잡는 표기를 그대로 고정한다", () => {
		// 미탐: 이름공간·기본 임포트, 별칭, require, 키를 변수로 계산하는 접근 (01 §5 B9 칸) — 스코프·값 추적이 없다.
		const missed = [
			'import * as b from "bun";\nconst v = b.env.X;',
			'import b from "bun";\nconst v = b.env.X;',
			"const p = process;\nconst v = p.env.X;",
			'const v = require("bun").env.X;',
			'const key = "env";\nconst v = process[key];',
		];
		expect(wrong(USECASE, missed, [])).toEqual([]);
	});

	test("구조분해의 주석 낀 키·따옴표 키·타입 주석도 노드로 보고 잡는다", () => {
		const lines = [
			"const {\n\t// 설정\n\tenv,\n} = process;",
			"const {\n\targv, // 인자\n\tenv,\n} = process;",
			'const { "env": e } = process;',
			'const { ["env"]: e } = process;',
			"const { env }: NodeJS.Process = process;",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("process·Bun 이 아닌 객체의 ?.·[ 접근과 env 가 아닌 속성은 잡지 않는다", () => {
		const lines = [
			"const v = job.process?.(x);",
			"const r = this.process[step];",
			'process["exitCode"] = 1;',
			"const a = process?.argv;",
			"const b = Bun?.version;",
		];
		expect(wrong(USECASE, lines, [])).toEqual([]);
	});

	test("주석·문자열·템플릿 안의 표기는 코드가 아니라서 잡지 않는다", () => {
		const lines = [
			"// process.env 는 packages/config 에서만 읽는다\nconst a = 1;",
			"/* const { env } = process; */\nconst a = 1;",
			'const s = "process.env.X";',
			"const t = `Bun.env.X`;",
		];
		expect(wrong(USECASE, lines, [])).toEqual([]);
	});

	test("(process as X).env·process!.env 처럼 값을 감싼 객체도 같은 접근으로 본다", () => {
		const lines = [
			"const a = (process as NodeJS.Process).env.X;",
			"const b = process!.env.X;",
			"const c = (process).env.X;",
			"const d = globalThis?.process?.env;",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("packages/config 와 제품 소스 밖(시험·scripts)은 대상이 아니다", () => {
		const text = "const a = process.env.A;";
		expect(rules("packages/config/src/env.ts", text)).toEqual([]);
		expect(rules("modules/m/test/x.ts", text)).toEqual([]);
		expect(rules("scripts/x.ts", text)).toEqual([]);
		expect(rules("test/x.ts", text)).toEqual([]);
	});
});

describe("B2-time-random 시간·난수 직접 호출", () => {
	test("domain·service 의 네 호출을 각각 잡는다", () => {
		const text = [
			"Date.now();",
			"new Date();",
			"Math.random();",
			"crypto.randomUUID();",
		].join("\n");
		expect(rules("modules/m/src/domain/x.ts", text)).toEqual([
			"B2-time-random:1",
			"B2-time-random:2",
			"B2-time-random:3",
			"B2-time-random:4",
		]);
		expect(rules("modules/m/src/service/x.ts", "Date.now();")).toEqual([
			"B2-time-random:1",
		]);
	});

	test("공백이 있는 인자 없는 new Date( ) 도 잡고 Date.now 참조(대입)도 잡는다", () => {
		expect(
			rules("modules/m/src/domain/x.ts", "const t = new Date( );"),
		).toEqual(["B2-time-random:1"]);
		expect(rules("modules/m/src/domain/x.ts", "const now = Date.now;")).toEqual(
			["B2-time-random:1"],
		);
	});

	test("인자가 있는 new Date(value) 는 값 변환이라 잡지 않는다", () => {
		expect(rules("modules/m/src/domain/x.ts", "new Date(value);")).toEqual([]);
	});

	test("괄호 없는 new Date 와 performance.now·getRandomValues·Bun.nanoseconds 도 잡는다", () => {
		const lines = [
			"const d = new Date;",
			"const t = performance.now();",
			"crypto.getRandomValues(buf);",
			"const n = Bun.nanoseconds();",
		];
		for (const line of lines) {
			expect(rules("modules/m/src/domain/x.ts", line)).toEqual([
				"B2-time-random:1",
			]);
		}
	});

	test("new 없는 Date() 와 괄호 사이가 줄로 나뉜 인자 없는 호출도 잡는다", () => {
		const lines = [
			"const s = Date();",
			"const s = Date ( );",
			"const s = Date(\n);",
			"const d = new Date(\n);",
		];
		expect(
			wrong("modules/m/src/domain/x.ts", lines, ["B2-time-random:1"]),
		).toEqual([]);
	});

	test("new Date (x)·여러 줄 인자·new DateTime()·toDate() 는 잡지 않는다", () => {
		const lines = [
			"new Date (x);",
			"new Date(\n\tvalue\n);",
			"new Date(\n\tvalue,\n);",
			"new DateTime();",
			"const d = toDate();",
		];
		expect(wrong("modules/m/src/domain/x.ts", lines, [])).toEqual([]);
	});

	test('Temporal.Now 의 멤버 접근(호출·참조·?.·["Now"]·globalThis·줄바꿈)을 잡는다 (TD-7 7-11)', () => {
		const lines = [
			"Temporal.Now.instant();",
			"Temporal.Now.plainDateISO();",
			"const n = Temporal.Now;",
			"globalThis.Temporal.Now.instant();",
			"Temporal?.Now.instant();",
			'Temporal["Now"].instant();',
			"Temporal\n\t.Now\n\t.instant();",
		];
		expect(
			wrong("modules/m/src/domain/x.ts", lines, ["B2-time-random:1"]),
		).toEqual([]);
	});

	test("Temporal 의 시계가 아닌 멤버와 다른 객체의 Temporal 은 잡지 않는다", () => {
		const lines = [
			"const t = Temporal.Instant.from(s);",
			"x.Temporal.Now.instant();",
		];
		expect(wrong("modules/m/src/domain/x.ts", lines, [])).toEqual([]);
	});

	test("adapter·usecase 와 모듈 밖은 대상이 아니다", () => {
		expect(rules("modules/m/src/adapter/x.ts", "Date.now();")).toEqual([]);
		expect(rules("modules/m/src/usecase/x.ts", "Date.now();")).toEqual([]);
		expect(rules("packages/kernel/src/x.ts", "Date.now();")).toEqual([]);
	});

	test("한 줄에 같은 규칙이 여러 번이면 한 건이다", () => {
		expect(
			rules(
				"modules/m/src/domain/x.ts",
				"const x = [Date.now(), Math.random()];",
			),
		).toEqual(["B2-time-random:1"]);
	});
});

describe("B11 쓰기·raw SQL", () => {
	test("adapter/postgres 밖의 .insert(·.update(·.delete( 를 잡는다", () => {
		const text = ["a.insert(1);", "a.update(1);", "a.delete(1);"].join("\n");
		expect(rules("modules/m/src/usecase/x.ts", text)).toEqual([
			"B11-write:1",
			"B11-write:2",
			"B11-write:3",
		]);
	});

	test("문자열·템플릿 리터럴·sql.raw 를 넘기는 쓰기 execute 를 잡는다", () => {
		const path = "modules/m/src/usecase/x.ts";
		expect(
			rules(path, 'await tx.execute("insert into a.t values (1)");'),
		).toEqual(["B11-write:1"]);
		expect(rules(path, "await tx.execute(`delete from a.t`);")).toEqual([
			"B11-write:1",
		]);
		// sql.raw 는 B11-raw-sql 도 함께 걸린다 — 규칙 목록 순서(write → raw-sql)대로 나온다.
		expect(
			rules(path, 'await tx.execute(sql.raw("delete from a.t"));'),
		).toEqual(["B11-write:1", "B11-raw-sql:1"]);
	});

	test("포매터가 인자를 다음 줄로 내린 쓰기 execute 도 호출이 시작한 줄로 잡는다", () => {
		expect(
			rules(USECASE, 'await tx.execute(\n\t"insert into a.t values (1)",\n);'),
		).toEqual(["B11-write:1"]);
		expect(
			rules(USECASE, "await tx.execute(\n\t`delete from a.t`,\n);"),
		).toEqual(["B11-write:1"]);
		// sql.raw 는 B11-raw-sql 도 함께 걸리고, 그 줄은 sql.raw( 가 있는 줄이다.
		expect(
			rules(
				USECASE,
				'await tx.execute(\n\tsql.raw(\n\t\t"delete from a.t",\n\t),\n);',
			),
		).toEqual(["B11-write:1", "B11-raw-sql:2"]);
		// 체인으로 이어진 쓰기는 .insert( 가 있는 줄이다.
		expect(rules(USECASE, "await tx\n\t.insert(users)\n\t.values(v);")).toEqual(
			["B11-write:2"],
		);
	});

	test("여러 줄이어도 handler.execute(cmd) 와 sql 태그 execute 는 B11-write 가 아니다", () => {
		expect(rules(USECASE, "await handler.execute(\n\tcmd,\n);")).toEqual([]);
		expect(rules(USECASE, "await handler.execute({\n\tid,\n});")).toEqual([]);
		expect(rules(USECASE, "await tx.execute(\n\tsql`select 1`,\n);")).toEqual([
			"B11-raw-sql:2",
		]);
	});

	test("usecase 의 handler.execute(cmd) 관례와 sql 태그 execute 는 B11-write 가 아니다", () => {
		const path = "modules/m/src/usecase/x.ts";
		expect(rules(path, "await handler.execute(cmd);")).toEqual([]);
		expect(rules(path, "useCase.execute({ id });")).toEqual([]);
		expect(rules(path, "await tx.execute(sql`select 1`);")).toEqual([
			"B11-raw-sql:1",
		]);
	});

	test("adapter/postgres 안과 시험은 쓰기 메서드가 허용된다", () => {
		expect(
			rules("modules/m/src/adapter/postgres/r.ts", "a.insert(1);"),
		).toEqual([]);
		expect(rules("modules/m/test/r.ts", "a.insert(1);")).toEqual([]);
	});

	test("메모리 구현·시험 대역·암호 경로는 B11-write 에서 제외되고, 같은 패키지의 다른 경로는 잡는다", () => {
		const text = "map.delete(key);";
		// Q3 — Map.delete 는 DB 쓰기가 아니다. 암호 경로는 node:crypto 의 cipher.update 때문이다(DV-033). 제외는 이 세 경로뿐이다.
		expect(rules("packages/infra/src/memory/cache.ts", text)).toEqual([]);
		expect(rules("packages/testkit/src/fake-ports.ts", text)).toEqual([]);
		expect(
			rules("packages/infra/src/crypto/aes.ts", "cipher.update(data);"),
		).toEqual([]);
		// 같은 패키지의 다른 경로(Postgres 전달·system)와 다른 패키지의 memory 폴더는 그대로 걸린다.
		expect(rules("packages/infra/src/postgres/transport.ts", text)).toEqual([
			"B11-write:1",
		]);
		expect(rules("packages/infra/src/system/clock.ts", text)).toEqual([
			"B11-write:1",
		]);
		expect(rules("packages/other/src/memory/cache.ts", text)).toEqual([
			"B11-write:1",
		]);
		// 제외 경로에서도 raw SQL 은 여전히 막는다 — B11-raw-sql 은 범위가 다르다.
		expect(
			rules("packages/infra/src/memory/q.ts", "const q = sql`select 1`;"),
		).toEqual(["B11-raw-sql:1"]);
	});

	test("adapter/postgres/raw 밖의 sql 태그를 잡고 raw 안은 허용한다", () => {
		const text = "const q = sql`select 1`;";
		expect(rules("modules/m/src/adapter/postgres/x.ts", text)).toEqual([
			"B11-raw-sql:1",
		]);
		expect(rules("modules/m/src/usecase/x.ts", text)).toEqual([
			"B11-raw-sql:1",
		]);
		expect(rules("modules/m/src/adapter/postgres/raw/x.ts", text)).toEqual([]);
	});

	test("sql.raw( 단독 호출도 raw SQL 이다 — raw 안은 허용한다", () => {
		const text = 'const q = sql.raw("x");';
		expect(rules("modules/m/src/usecase/x.ts", text)).toEqual([
			"B11-raw-sql:1",
		]);
		expect(rules("modules/m/src/adapter/postgres/x.ts", text)).toEqual([
			"B11-raw-sql:1",
		]);
		expect(rules("modules/m/src/adapter/postgres/raw/x.ts", text)).toEqual([]);
	});
});

describe("줄바꿈이 낀 입력 — 회귀 입력(포매터 출력에서 옮겨 둔 모양)", () => {
	// 입력은 Biome 2.6.8 기본 설정의 포맷 출력을 옮겨 둔 고정 입력이다 — 줄이 길어 어디서 나뉘었는지가 그대로 들어 있다.
	// 판정은 AST 노드라 줄바꿈과 무관하고 포매터 버전에도 묶이지 않는다. 이 묶음은 보고 줄이 갈래가 정한 노드의 시작 줄로 고정되는지를 지킨다.
	const DOMAIN = "modules/m/src/domain/x.ts";
	const cases = [
		{
			name: "crypto 뒤에서 나뉜 randomUUID 체인",
			path: DOMAIN,
			text: [
				"const sessionIdentifierForTheCurrentRequest = crypto",
				"\t.randomUUID()",
				'\t.replaceAll("-", "")',
				"\t.slice(0, 8);",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "crypto 뒤에서 나뉜 getRandomValues 체인",
			path: DOMAIN,
			text: [
				"const randomBytesForTheNonceOfTheRequest = crypto",
				"\t.getRandomValues(new Uint8Array(16))",
				"\t.map((b) => b % 10)",
				'\t.join("");',
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "performance 뒤에서 나뉜 now 체인",
			path: DOMAIN,
			text: [
				"const elapsedMillisecondsSinceTheRequestStarted = performance",
				"\t.now()",
				"\t.toFixed(3)",
				'\t.padStart(12, "0");',
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "globalThis.crypto 뒤에서 나뉜 randomUUID 체인",
			path: DOMAIN,
			text: [
				"const identifierWithTheGlobalPrefix = globalThis.crypto",
				"\t.randomUUID()",
				'\t.replaceAll("-", "")',
				"\t.slice(0, 8);",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "globalThis.crypto 뒤에서 나뉜 getRandomValues 체인",
			path: DOMAIN,
			text: [
				"const bytesWithTheGlobalPrefix = globalThis.crypto",
				"\t.getRandomValues(new Uint8Array(16))",
				"\t.map((b) => b % 10)",
				'\t.join("");',
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "globalThis.performance 뒤에서 나뉜 now 체인",
			path: DOMAIN,
			text: [
				"const elapsedWithTheGlobalPrefix = globalThis.performance",
				"\t.now()",
				"\t.toFixed(3)",
				'\t.padStart(12, "0");',
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "Date.now() 는 붙여 두고 뒤 체인만 나눈다",
			path: DOMAIN,
			text: [
				"const stampOfTheCurrentRequestInBase36 = Date.now()",
				"\t.toString(36)",
				'\t.padStart(8, "0")',
				"\t.toUpperCase();",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "Math.random() 은 붙여 두고 뒤 체인만 나눈다",
			path: DOMAIN,
			text: [
				"const rollOfTheDiceForTheCurrentRequest = Math.random()",
				"\t.toString(36)",
				'\t.padStart(8, "0")',
				"\t.toUpperCase();",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "Bun.nanoseconds() 는 붙여 두고 뒤 체인만 나눈다",
			path: DOMAIN,
			text: [
				"const nanosecondsOfTheCurrentRequest = Bun.nanoseconds()",
				"\t.toString(36)",
				'\t.padStart(8, "0")',
				"\t.toUpperCase();",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "new Date() 는 붙여 두고 뒤 체인만 나눈다",
			path: DOMAIN,
			text: [
				"const isoStampOfTheCurrentRequest = new Date()",
				"\t.toISOString()",
				'\t.replaceAll("-", "")',
				"\t.slice(0, 8)",
				"\t.toUpperCase();",
			].join("\n"),
			expected: ["B2-time-random:1"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 process 뒤에서 나뉜 .env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfiguredAnywhereEls = process",
				"\t\t.env.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 Bun 뒤에서 나뉜 .env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfiguredAnywhereElseAnd = Bun",
				"\t\t.env.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 import.meta 뒤에서 나뉜 .env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfiguredAnywher = import.meta",
				"\t\t.env.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 globalThis.process 뒤에서 나뉜 .env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfigured = globalThis.process",
				"\t\t.env.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 process 뒤에서 나뉜 ?.env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfiguredAnywhereEl = process",
				"\t\t?.env?.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "기본 매개변수 줄이 가득 차 Bun 뒤에서 나뉜 ?.env",
			path: USECASE,
			text: [
				"const f = (",
				"\tfallbackValueFromTheEnvironmentWhenNothingIsConfiguredAnywhereElseAn = Bun",
				"\t\t?.env?.X,",
				") => 1;",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "process.env.X 는 붙여 두고 뒤 체인만 나눈다",
			path: USECASE,
			text: [
				"const urls =",
				'\tprocess.env.DATABASE_URL_FOR_THE_PRIMARY_REGION_OF_THE_SERVICE.split(",")',
				"\t\t.map((u) => u.trim())",
				"\t\t.filter(Boolean);",
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "Bun.env 는 붙여 두고 긴 키 앞에서 나눈다",
			path: USECASE,
			text: [
				"const wide =",
				"\tBun.env",
				"\t\t.SOME_VERY_LONG_ENVIRONMENT_VARIABLE_NAME_HERE_AND_MORE_AND_MORE_AND_MORE ??",
				'\t"x";',
			].join("\n"),
			expected: ["B9-env:2"],
		},
		{
			name: "키마다 한 줄로 나뉜 구조분해",
			path: USECASE,
			text: [
				"const {",
				"\targv,",
				"\tenv,",
				"\tplatform,",
				"\tpid,",
				"\tcwd,",
				"\texecPath,",
				"\tversions,",
				"\texitCode,",
				"\ttitle,",
				"\tumask,",
				"} = process;",
			].join("\n"),
			expected: ["B9-env:1"],
		},
		{
			name: "중첩 구조분해 안쪽이 한 줄로 남은 모양",
			path: USECASE,
			text: [
				"const {",
				"\tenv: { DATABASE_URL, REDIS_URL, QUEUE_URL, CACHE_URL, SEARCH_URL, MAIL_URL },",
				"} = Bun;",
			].join("\n"),
			expected: ["B9-env:1"],
		},
		{
			name: "대입식 구조분해의 오른쪽이 다음 줄로 내려간 모양",
			path: USECASE,
			text: [
				"({ argv, env, platform, pid, cwd, execPath, versions, exitCode, title, umask } =",
				"\tglobalThis.process);",
			].join("\n"),
			expected: ["B9-env:1"],
		},
		{
			name: "이름마다 한 줄로 나뉜 bun 임포트",
			path: USECASE,
			text: [
				"import {",
				"\tserve,",
				"\tenv,",
				"\tfile,",
				"\tspawn,",
				"\twrite,",
				"\tsleep,",
				"\tpassword,",
				"\tgzipSync,",
				"\tdeflateSync,",
				'} from "bun";',
			].join("\n"),
			expected: ["B9-env:1"],
		},
		{
			name: "이름마다 한 줄로 나뉜 bun 재내보내기",
			path: USECASE,
			text: [
				"export {",
				"\tserve,",
				"\tspawn,",
				"\tfile,",
				"\twrite,",
				"\tsleep,",
				"\tpassword,",
				"\tgzipSync,",
				"\tdeflateSync,",
				"\tenv,",
				'} from "bun";',
			].join("\n"),
			expected: ["B9-env:1"],
		},
		{
			name: "database 뒤에서 나뉜 insert 체인",
			path: USECASE,
			text: [
				"const created = await database",
				"\t.insert(accounts)",
				"\t.values({ id, name, createdAt })",
				"\t.returning({ id: accounts.id });",
			].join("\n"),
			expected: ["B11-write:2"],
		},
		{
			name: "transaction 뒤에서 나뉜 update 체인",
			path: USECASE,
			text: [
				"await transaction",
				"\t.update(accounts)",
				"\t.set({ name: nextName, updatedAt })",
				"\t.where(eq(accounts.id, id));",
			].join("\n"),
			expected: ["B11-write:2"],
		},
		{
			name: "멤버 경로 뒤에서 나뉜 delete 체인",
			path: USECASE,
			text: [
				"await this.connection.manager",
				"\t.delete(accounts)",
				"\t.where(eq(accounts.id, id))",
				"\t.returning();",
			].join("\n"),
			expected: ["B11-write:2"],
		},
		{
			name: "인자가 다음 줄로 내려간 문자열 execute",
			path: USECASE,
			text: [
				"await transaction.execute(",
				"\t\"delete from accounts where created_at < now() - interval '30 days' and status = 'closed'\",",
				");",
			].join("\n"),
			expected: ["B11-write:1"],
		},
		{
			name: "인자가 다음 줄로 내려간 템플릿 execute",
			path: USECASE,
			text: [
				"await transaction.execute(",
				"\t`delete from accounts where created_at < now() - interval '30 days' and status = 'closed'`,",
				");",
			].join("\n"),
			expected: ["B11-write:1"],
		},
		{
			name: "인자가 다음 줄로 내려간 sql.raw execute",
			path: USECASE,
			text: [
				"await transaction.execute(",
				"\tsql.raw(\"delete from accounts where created_at < now() - interval '30 days'\"),",
				");",
			].join("\n"),
			expected: ["B11-write:1", "B11-raw-sql:2"],
		},
		{
			name: "execute 인자 안에서 sql 뒤에서 나뉜 raw 체인",
			path: USECASE,
			text: [
				"await transaction.execute(",
				"\tsql",
				'\t\t.raw("delete from accounts where created_at < now()")',
				"\t\t.mapWith(Number)",
				'\t\t.as("x"),',
				");",
			].join("\n"),
			expected: ["B11-write:1", "B11-raw-sql:2"],
		},
		{
			name: "sql 뒤에서 나뉜 raw 체인",
			path: USECASE,
			text: [
				"const rawQueryForTheAccountsOfTheRegion = sql",
				'\t.raw("select 1 from accounts")',
				"\t.mapWith(Number)",
				'\t.as("alias")',
				"\t.inlineParams();",
			].join("\n"),
			expected: ["B11-raw-sql:1"],
		},
		{
			name: "한 줄에 들어가는 sql.raw 체인",
			path: USECASE,
			text: 'const q = sql.raw("select 1").as("alias").mapWith(Number).inlineParams();',
			expected: ["B11-raw-sql:1"],
		},
		{
			name: "sql 태그 뒤 체인만 나뉜 모양",
			path: USECASE,
			text: [
				"const q = sql`select count(*) from accounts where region = 'kr'`",
				"\t.mapWith(Number)",
				'\t.as("count");',
			].join("\n"),
			expected: ["B11-raw-sql:1"],
		},
	];
	for (const c of cases) {
		test(c.name, () => {
			expect(rules(c.path, c.text)).toEqual(c.expected);
		});
	}
});

describe("`.` 앞뒤 줄바꿈 — 포매터가 만든 적은 없지만 같은 노드라 잡는 표기", () => {
	// 위 묶음은 Biome 2.6.8 이 만든 출력이다. 포매터 버전·설정이 바뀌어 대문자 머리(Date·Math·Bun)나 import.meta 도
	// 나뉘기 시작해도 같은 노드로 파싱되므로 잡는다 — 공백·줄바꿈은 노드를 바꾸지 않는다.
	test("B2 의 모든 머리가 `.` 앞뒤에서 나뉘어도 잡는다", () => {
		const lines = [
			"const a = Date\n\t.now();",
			"const b = Math\n\t.random();",
			"const c = Bun\n\t.nanoseconds();",
			"const d = crypto.\n\trandomUUID();",
			"const e = performance\n\t.\n\tnow();",
		];
		expect(
			wrong("modules/m/src/domain/x.ts", lines, ["B2-time-random:1"]),
		).toEqual([]);
	});

	test("B9 의 process·Bun·import.meta 가 `.` 앞뒤에서 나뉘어도 잡는다", () => {
		const lines = [
			"const a = process\n\t.env.X;",
			"const b = Bun\n\t.env.X;",
			"const c = import\n\t.meta\n\t.env.X;",
			"const d = process.\n\tenv.X;",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});

	test("B11 의 execute 인자와 raw 체인에서 sql 뒤 `.raw(` 가 나뉘어도 잡는다", () => {
		expect(rules(USECASE, "const q = sql\n\t.raw(x)\n\t.as(y);")).toEqual([
			"B11-raw-sql:1",
		]);
		expect(rules(USECASE, "await tx.execute(sql\n\t.raw(x));")).toEqual([
			"B11-write:1",
			"B11-raw-sql:1",
		]);
	});
});

describe("토큰 사이 주석·중괄호 — 문자열 검사가 놓치던 모양을 노드로 잡는다", () => {
	test("호출의 토큰 사이에 주석이 끼어도 잡는다", () => {
		expect(
			rules("modules/m/src/domain/x.ts", "const d = new Date(/* now */);"),
		).toEqual(["B2-time-random:1"]);
		expect(
			rules("modules/m/src/domain/x.ts", "const t = Date /* c */ .now();"),
		).toEqual(["B2-time-random:1"]);
		expect(
			rules(USECASE, 'await tx.execute(\n\t// 정리\n\t"DELETE",\n);'),
		).toEqual(["B11-write:1"]);
	});

	test("구조분해 안 문자열·주석에 짝이 안 맞는 중괄호가 있거나 중괄호가 네 겹 이상이어도 잡는다", () => {
		const lines = [
			'const { env = "}" } = process;',
			"const {\n\tenv, // }\n} = process;",
			"const { env: { A: { B: { C } } } } = process;",
		];
		expect(wrong(USECASE, lines, ["B9-env:1"])).toEqual([]);
	});
});

describe("줄 번호 보고", () => {
	test("서로 다른 갈래가 같은 줄에서 걸려도 한 건이다", () => {
		expect(rules(USECASE, "const a = [process.env.A, Bun.env.B];")).toEqual([
			"B9-env:1",
		]);
	});

	test("여러 줄 매치와 그 뒤 줄의 다른 위반은 각각 자기 줄로 보고한다", () => {
		const text = "const {\n\tenv,\n} = process;\nconst z = process.env.Z;";
		expect(rules(USECASE, text)).toEqual(["B9-env:1", "B9-env:4"]);
	});

	test("줄이 많은 입력에서도 매치마다 자기 줄 번호를 센다", () => {
		const count = 3000;
		const text = Array.from(
			{ length: count },
			(_, i) => `x.delete(${i});`,
		).join("\n");
		const lines = scanPurity(USECASE, text).map((v) => v.line);
		expect(lines).toEqual(Array.from({ length: count }, (_, i) => i + 1));
	});

	test("줄의 첫 글자에서 시작하는 매치는 그 줄로 센다", () => {
		expect(rules("modules/m/src/domain/x.ts", "a;\nDate();\nDate();")).toEqual([
			"B2-time-random:2",
			"B2-time-random:3",
		]);
	});
});

describe("정규식이 놓치던 표기 여섯 — 노드로 잡는다 (TD-1 m-2)", () => {
	const DOMAIN_PATH = "modules/m/src/domain/x.ts";

	test("타입 인자가 붙은 sql<number>`…` 태그 템플릿", () => {
		expect(rules(USECASE, "const q = sql<number>`select 1`;")).toEqual([
			"B11-raw-sql:1",
		]);
	});

	test(".execute<Row>( 의 문자열 인자", () => {
		expect(rules(USECASE, 'await tx.execute<Row>("delete from a.t");')).toEqual(
			["B11-write:1"],
		);
	});

	test(".execute?.( 의 템플릿 인자", () => {
		expect(rules(USECASE, "await tx.execute?.(`delete from a.t`);")).toEqual([
			"B11-write:1",
		]);
	});

	test("crypto?.randomUUID()", () => {
		expect(rules(DOMAIN_PATH, "const id = crypto?.randomUUID();")).toEqual([
			"B2-time-random:1",
		]);
	});

	test("performance?.now()", () => {
		expect(rules(DOMAIN_PATH, "const t = performance?.now();")).toEqual([
			"B2-time-random:1",
		]);
	});

	test("괄호 없는 new globalThis.Date", () => {
		expect(rules(DOMAIN_PATH, "const d = new globalThis.Date;")).toEqual([
			"B2-time-random:1",
		]);
	});
});

describe("줄 번호 — swc 위치(1부터 세는 UTF-8 바이트)를 줄로 바꾼다", () => {
	test("위반 앞의 한글 주석이 있어도 바이트가 아니라 줄로 센다", () => {
		// 한글 한 자는 UTF-8 로 3바이트라 문자 인덱스로 세면 위반이 뒤 줄로 밀린다.
		const text = [
			"// 한글 한글 한글 한글 한글 한글 한글 한글",
			"const a = process.env.A;",
			"const b = 1;",
			"const c = 2;",
			"const d = 3;",
		].join("\n");
		expect(rules(USECASE, text)).toEqual(["B9-env:2"]);
	});

	test("네 바이트 문자(이모지)가 앞 줄 문자열에 있어도 줄을 센다", () => {
		const text =
			'const s = "😀😀😀😀😀😀😀😀";\nconst a = process.env.A;\nconst b = 1;\nconst c = 2;';
		expect(rules(USECASE, text)).toEqual(["B9-env:2"]);
	});

	test("같은 텍스트를 연속으로 스캔해도, 사이에 다른 텍스트를 스캔해도 결과가 같다", () => {
		const text = "// 한글\nconst a = process.env.A;\nconst b = Bun.env.B;";
		const first = scanPurity(USECASE, text);
		scanPurity(USECASE, "const pad = 1;\n".repeat(200));
		const second = scanPurity(USECASE, text);
		expect(second).toEqual(first);
		expect(first.map((v) => v.line)).toEqual([2, 3]);
	});

	test("첫 줄·개행 없는 마지막 줄의 위반도 자기 줄이다", () => {
		expect(rules(USECASE, "process.env.A;")).toEqual(["B9-env:1"]);
		expect(rules(USECASE, "a;\nb;\nprocess.env.A")).toEqual(["B9-env:3"]);
	});

	test("여러 줄에 걸친 노드는 갈래가 정한 시작 줄로 보고한다", () => {
		// new Date( ) 식은 `new` 가 있는 줄, 쓰기 호출은 `.insert(` 가 있는 줄이다.
		expect(
			rules("modules/m/src/domain/x.ts", "a;\nconst d = new Date(\n);"),
		).toEqual(["B2-time-random:2"]);
		expect(
			rules(USECASE, "await tx\n\t.insert(\n\t\tusers,\n\t)\n\t.values(v);"),
		).toEqual(["B11-write:2"]);
	});

	test("셰뱅 줄이 있는 파일과 BOM 으로 시작하는 파일도 줄을 맞춘다", () => {
		expect(
			rules(USECASE, "#!/usr/bin/env bun\nconst a = process.env.A;"),
		).toEqual(["B9-env:2"]);
		expect(rules(USECASE, "﻿const a = 1;\nconst b = process.env.B;")).toEqual([
			"B9-env:2",
		]);
	});
});

describe("파싱", () => {
	test("구문 오류가 있는 제품 소스는 경로를 담은 오류를 던진다 — 조용히 통과시키지 않는다", () => {
		expect(() => scanPurity(USECASE, "const = ;")).toThrow(USECASE);
	});

	test("적용 규칙이 없는 경로는 구문 오류여도 파싱하지 않는다", () => {
		expect(scanPurity("scripts/x.ts", "const = ;")).toEqual([]);
		expect(scanPurity("modules/m/test/x.ts", "const = ;")).toEqual([]);
	});

	test("확장자로 문법을 정한다 — .tsx 는 JSX, .js 는 타입 주석 없는 ECMAScript", () => {
		expect(
			rules(
				"modules/m/src/usecase/x.tsx",
				"const el = <div>{process.env.X}</div>;",
			),
		).toEqual(["B9-env:1"]);
		expect(
			rules("modules/m/src/usecase/x.js", "const v = process.env.X;"),
		).toEqual(["B9-env:1"]);
		expect(
			rules("modules/m/src/usecase/x.mts", "const v: string = process.env.X!;"),
		).toEqual(["B9-env:1"]);
	});
});

describe("규칙 목록", () => {
	test("낼 수 있는 ID 는 네 가지다", () => {
		expect([...PURITY_RULE_IDS].sort()).toEqual([
			"B11-raw-sql",
			"B11-write",
			"B2-time-random",
			"B9-env",
		]);
	});
});
