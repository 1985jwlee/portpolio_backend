import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	CLASSIFICATION_RULE_IDS,
	type ClassificationViolation,
	checkClassification,
	loadModules,
	type ModuleInput,
} from "./check-classification.ts";

const FIXTURES = fileURLToPath(
	new URL("./fixtures/classification/", import.meta.url),
);
const PASSING = `${FIXTURES}passing`;
const VIOLATING = `${FIXTURES}violating`;
const REPO = fileURLToPath(new URL("../", import.meta.url));

async function violationsOf(
	root: string,
	module: string,
): Promise<ClassificationViolation[]> {
	const inputs = (await loadModules(root)).filter((i) => i.module === module);
	expect(inputs).toHaveLength(1);
	return checkClassification(inputs);
}

function summary(violations: ClassificationViolation[]): string[] {
	return violations
		.map((v) => `${v.rule} ${v.table ?? ""}.${v.column ?? ""}`)
		.sort();
}

describe("픽스처 루트", () => {
	test("통과 루트: schema.ts 를 가진 모듈만 대상이고 위반이 없다", async () => {
		const inputs = await loadModules(PASSING);
		expect(inputs.filter((i) => i.tables !== undefined)).toHaveLength(1);
		expect(checkClassification(inputs)).toEqual([]);
	});

	test("분류 파일이 없는 모듈", async () => {
		expect(summary(await violationsOf(VIOLATING, "no-classification"))).toEqual(
			["CLS-no-classification-file ."],
		);
	});

	test("스키마의 컬럼이 맵에 없으면 미분류다", async () => {
		expect(summary(await violationsOf(VIOLATING, "unclassified"))).toEqual([
			"CLS-unclassified-column item.body",
		]);
	});

	test("맵에만 있는 표·컬럼은 알 수 없는 항목이다", async () => {
		expect(summary(await violationsOf(VIOLATING, "unknown-entry"))).toEqual([
			"CLS-unknown-entry ghost_table.",
			"CLS-unknown-entry item.ghost",
		]);
	});

	test("ENC 컬럼은 _enc 접미여야 하고 접미 없는 동명 평문 컬럼이 없어야 한다", async () => {
		expect(summary(await violationsOf(VIOLATING, "enc-naming"))).toEqual([
			"CLS-enc-naming item.note_enc",
			"CLS-enc-naming item.secret",
		]);
	});

	test("허용 등급이 아니면 거부한다", async () => {
		const rules = (await violationsOf(VIOLATING, "bad-grade")).map(
			(v) => v.rule,
		);
		expect(rules).toContain("CLS-invalid-grade");
	});

	test("표 항목이 객체가 아니면 형식 위반이다", async () => {
		const rules = (await violationsOf(VIOLATING, "bad-shape")).map(
			(v) => v.rule,
		);
		expect(rules).toContain("CLS-invalid-shape");
	});

	test("위반 픽스처 전체가 여섯 규칙을 모두 낸다", async () => {
		const rules = new Set(
			checkClassification(await loadModules(VIOLATING)).map((v) => v.rule),
		);
		expect([...rules].sort()).toEqual([...CLASSIFICATION_RULE_IDS].sort());
	});
});

describe("판정 함수 (파일 없이)", () => {
	const columns = new Map([["t", new Set(["a"])]]);

	test("schema.ts 가 없는 모듈은 건너뛴다", () => {
		const input: ModuleInput = {
			module: "m",
			tables: undefined,
			hasClassificationFile: false,
			classification: undefined,
		};
		expect(checkClassification([input])).toEqual([]);
	});

	test("classification 내보내기가 없으면 형식 위반 하나만 낸다 — 모든 컬럼을 미분류로 쏟지 않는다", () => {
		const violations = checkClassification([
			{
				module: "m",
				tables: columns,
				hasClassificationFile: true,
				classification: undefined,
			},
		]);
		expect(violations.map((v) => v.rule)).toEqual(["CLS-invalid-shape"]);
	});

	test("모든 컬럼이 분류되면 통과한다", () => {
		expect(
			checkClassification([
				{
					module: "m",
					tables: columns,
					hasClassificationFile: true,
					classification: { t: { a: "PII" } },
				},
			]),
		).toEqual([]);
	});
});

describe("실행부", () => {
	async function run(root: string): Promise<{ code: number; out: string }> {
		const proc = Bun.spawn(
			[process.execPath, "scripts/check-classification.ts", root],
			{ cwd: REPO, stdout: "pipe", stderr: "pipe" },
		);
		const out = await new Response(proc.stdout).text();
		return { code: await proc.exited, out };
	}

	test("위반이 있으면 종료 1 과 규칙 ID 를 출력한다", async () => {
		const { code, out } = await run(VIOLATING);
		expect(code).toBe(1);
		expect(out).toContain("CLS-unclassified-column");
	});

	test("통과하면 종료 0 이다", async () => {
		expect((await run(PASSING)).code).toBe(0);
	});

	test("실저장소: 대상이 0개여도 그 사실을 출력하고 종료 0 이다", async () => {
		const { code, out } = await run(REPO);
		expect(code).toBe(0);
		expect(out).toMatch(/검사 대상 0|모듈 \d+/);
	});
});
