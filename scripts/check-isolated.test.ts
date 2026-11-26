import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkIsolated,
	ISOLATED_RULE_IDS,
	type IsolationFinding,
	parseMissingPfModules,
} from "./check-isolated.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url)).replace(
	/[\\/]$/,
	"",
);
const SCRIPT = fileURLToPath(new URL("./check-isolated.ts", import.meta.url));
const OPTIONS = {
	tscPath: join(REPO, "node_modules", "typescript", "bin", "tsc"),
};

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function put(root: string, path: string, content: string): void {
	const full = join(root, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content);
}

function manifest(
	root: string,
	dir: string,
	name: string,
	dependencies: Record<string, string> = {},
): void {
	put(
		root,
		`${dir}/package.json`,
		JSON.stringify({
			name,
			version: "1.0.0",
			type: "module",
			exports: { ".": "./src/index.ts" },
			dependencies,
		}),
	);
}

const WS = "workspace:*";

/**
 * kernel ← a-contract ← a 로 이어지는 깨끗한 루트.
 * a 는 계약의 타입(`import type`)과 값(`CONTRACT_NAME`)을 둘 다 임포트한다.
 */
function cleanRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "isolated-test-"));
	roots.push(root);
	manifest(root, "packages/kernel", "@pf/kernel");
	put(root, "packages/kernel/src/index.ts", "export type Uuid = string;\n");
	manifest(root, "modules/a-contract", "@pf/a-contract", {
		"@pf/kernel": WS,
	});
	put(
		root,
		"modules/a-contract/src/index.ts",
		'import type { Uuid } from "@pf/kernel";\nexport type Dto = { readonly id: Uuid };\nexport const CONTRACT_NAME = "a";\n',
	);
	manifest(root, "modules/a", "@pf/a", {
		"@pf/a-contract": WS,
		"@pf/kernel": WS,
	});
	put(
		root,
		"modules/a/src/index.ts",
		'import { CONTRACT_NAME, type Dto } from "@pf/a-contract";\nexport const name: string = CONTRACT_NAME;\nexport type Echo = Dto;\n',
	);
	return root;
}

function summary(findings: IsolationFinding[]): string[] {
	return findings.map((f) => `${f.rule} ${f.module}`).sort();
}

describe("격리 판정", () => {
	test("선언한 의존만 복사해도 타입체크·번들이 통과한다(전이 의존 포함)", () => {
		const { modules, findings } = checkIsolated(cleanRoot(), OPTIONS);
		expect(modules).toEqual(["modules/a", "modules/a-contract"]);
		expect(findings).toEqual([]);
	});

	test("타입만 쓰는 의존의 선언을 빼면 타입체크가 TS2307 로 잡고 번들은 못 잡는다(G11 기준 4)", () => {
		const root = cleanRoot();
		manifest(root, "modules/a", "@pf/a", { "@pf/kernel": WS });
		put(
			root,
			"modules/a/src/index.ts",
			'import type { Dto } from "@pf/a-contract";\nexport type Echo = Dto;\n',
		);
		const { findings } = checkIsolated(root, OPTIONS);
		expect(summary(findings)).toEqual(["ISO-type-missing modules/a"]);
		expect(findings[0]?.detail).toContain("@pf/a-contract");
	});

	test("값을 쓰는 의존의 선언을 빼면 타입체크와 번들이 모두 잡는다", () => {
		const root = cleanRoot();
		manifest(root, "modules/a", "@pf/a", { "@pf/kernel": WS });
		expect(summary(checkIsolated(root, OPTIONS).findings)).toEqual([
			"ISO-bundle modules/a",
			"ISO-type-missing modules/a",
		]);
	});

	test("계약이 kernel 선언을 빼먹으면 계약 모듈이 잡힌다", () => {
		const root = cleanRoot();
		manifest(root, "modules/a-contract", "@pf/a-contract");
		expect(summary(checkIsolated(root, OPTIONS).findings)).toContain(
			"ISO-type-missing modules/a-contract",
		);
	});

	test("워크스페이스에 없는 의존을 선언하면 알려 준다", () => {
		const root = cleanRoot();
		manifest(root, "modules/a", "@pf/a", {
			"@pf/a-contract": WS,
			"@pf/kernel": WS,
			"@pf/ghost": WS,
		});
		expect(summary(checkIsolated(root, OPTIONS).findings)).toEqual([
			"ISO-unknown-dep modules/a",
		]);
	});

	test("devDependencies 와 시험은 복사하지 않는다 — src 가 시험용 의존을 쓰면 잡힌다", () => {
		const root = cleanRoot();
		manifest(root, "packages/testkit", "@pf/testkit");
		put(root, "packages/testkit/src/index.ts", "export const T = 1;\n");
		put(
			root,
			"modules/a/package.json",
			JSON.stringify({
				name: "@pf/a",
				version: "1.0.0",
				type: "module",
				dependencies: { "@pf/a-contract": WS, "@pf/kernel": WS },
				devDependencies: { "@pf/testkit": WS },
			}),
		);
		put(
			root,
			"modules/a/src/index.ts",
			'import { T } from "@pf/testkit";\nexport const t = T;\n',
		);
		expect(summary(checkIsolated(root, OPTIONS).findings)).toContain(
			"ISO-type-missing modules/a",
		);
	});

	test("위반 상태 전체가 세 규칙을 모두 낸다", () => {
		const root = cleanRoot();
		manifest(root, "modules/a", "@pf/a", { "@pf/kernel": WS, "@pf/ghost": WS });
		const rules = checkIsolated(root, OPTIONS).findings.map((f) => f.rule);
		expect(new Set(rules)).toEqual(new Set(ISOLATED_RULE_IDS));
	});
});

describe("tsc 출력 읽기", () => {
	test("@pf 모듈을 못 찾는 TS2307 만 모듈 단위로 합쳐 뽑는다", () => {
		const output = [
			"pkg/src/a.ts(3,25): error TS2307: Cannot find module '@pf/x' or its corresponding type declarations.",
			"pkg/src/b.ts(1,1): error TS2307: Cannot find module '@pf/x' or its corresponding type declarations.",
			"pkg/src/c.ts(2,1): error TS2307: Cannot find module 'drizzle-orm' or its corresponding type declarations.",
			"pkg/src/d.ts(9,1): error TS2304: Cannot find name 'Bun'.",
			"pkg/src/e.ts(4,7): error TS2307: Cannot find module '@pf/y/deep' or its corresponding type declarations.",
		].join("\n");
		expect(parseMissingPfModules(output)).toEqual([
			"@pf/x — pkg/src/a.ts:3",
			"@pf/y/deep — pkg/src/e.ts:4",
		]);
	});

	test("오류가 없으면 빈 목록이다", () => {
		expect(parseMissingPfModules("")).toEqual([]);
	});
});

describe("명령줄", () => {
	function run(root: string): { code: number; out: string } {
		const child = Bun.spawnSync([process.execPath, SCRIPT, root], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return { code: child.exitCode, out: child.stdout.toString() };
	}

	test("깨끗한 루트는 종료 0", () => {
		const result = run(cleanRoot());
		expect(result.code).toBe(0);
		expect(result.out).toContain("모듈 2 · 위반 0");
	});

	test("선언 누락은 종료 1 이고 규칙 ID 를 출력한다", () => {
		const root = cleanRoot();
		manifest(root, "modules/a", "@pf/a", { "@pf/kernel": WS });
		const result = run(root);
		expect(result.code).toBe(1);
		expect(result.out).toContain("ISO-type-missing modules/a");
	});

	test("모듈이 없는 루트는 검사 대상 0 으로 통과한다", () => {
		const root = mkdtempSync(join(tmpdir(), "isolated-empty-"));
		roots.push(root);
		const result = run(root);
		expect(result.code).toBe(0);
		expect(result.out).toContain("검사 대상 0");
	});
});

describe("실저장소", () => {
	test("모든 모듈이 선언한 의존만으로 타입체크·번들된다", () => {
		const { modules, findings } = checkIsolated(REPO, OPTIONS);
		expect(modules).toEqual([
			"modules/events",
			"modules/events-contract",
			"modules/observability",
		]);
		expect(findings).toEqual([]);
	}, 60_000);
});
