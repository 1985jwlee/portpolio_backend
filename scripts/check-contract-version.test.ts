import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONTRACT_RULE_IDS,
	type ContractViolation,
	canWriteLock,
	hashContract,
	judgeContract,
	loadTargets,
	updateLocks,
} from "./check-contract-version.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = fileURLToPath(
	new URL("./check-contract-version.ts", import.meta.url),
);

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

function setVersion(root: string, dir: string, version: string): void {
	put(
		root,
		`${dir}/package.json`,
		`${JSON.stringify({ name: dir, version })}\n`,
	);
}

const CONTRACT = "modules/a-contract";
const KERNEL = "packages/kernel";

/** 계약 패키지(a-contract)와 kernel 하나씩, lock 까지 만든 깨끗한 루트. */
function cleanRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "contract-version-"));
	roots.push(root);
	for (const dir of [CONTRACT, KERNEL]) {
		setVersion(root, dir, "1.0.0");
		put(root, `${dir}/src/index.ts`, "export type A = string;\n");
	}
	put(root, `${CONTRACT}/golden/a.v1.json`, '{ "a": 1 }\n');
	const { refused } = updateLocks(root, loadTargets(root));
	expect(refused).toEqual([]);
	return root;
}

function violationsOf(root: string): ContractViolation[] {
	return judgeContract(loadTargets(root));
}

function summary(violations: ContractViolation[]): string[] {
	return violations.map((v) => `${v.rule} ${v.dir}`).sort();
}

function run(root: string, ...args: string[]): { code: number; out: string } {
	const child = Bun.spawnSync([process.execPath, SCRIPT, root, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: child.exitCode, out: child.stdout.toString() };
}

describe("판정", () => {
	test("깨끗한 루트는 위반이 없다", () => {
		expect(violationsOf(cleanRoot())).toEqual([]);
	});

	test("lock 이 없으면 실패한다", () => {
		const root = cleanRoot();
		rmSync(join(root, CONTRACT, "contract.lock.json"));
		expect(summary(violationsOf(root))).toEqual([`CV-no-lock ${CONTRACT}`]);
	});

	test("소스가 바뀌었는데 버전이 그대로면 실패한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		expect(summary(violationsOf(root))).toEqual([`CV-not-bumped ${CONTRACT}`]);
	});

	test("골든 JSON 만 바뀌어도 버전이 그대로면 실패한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/golden/a.v1.json`, '{ "a": 2 }\n');
		expect(summary(violationsOf(root))).toEqual([`CV-not-bumped ${CONTRACT}`]);
	});

	test("버전을 낮춰도 내용이 바뀌었으면 실패한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		setVersion(root, CONTRACT, "0.9.0");
		expect(summary(violationsOf(root))).toEqual([`CV-not-bumped ${CONTRACT}`]);
	});

	test("내용이 바뀌고 버전이 올랐으면 --update 전까지는 lock 갱신 요구로 실패한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		setVersion(root, CONTRACT, "1.1.0");
		expect(summary(violationsOf(root))).toEqual([`CV-lock-stale ${CONTRACT}`]);
	});

	test("내용이 바뀌고 버전이 오르고 lock 도 갱신하면 통과한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		setVersion(root, CONTRACT, "1.1.0");
		const { written, refused } = updateLocks(root, loadTargets(root));
		expect(refused).toEqual([]);
		expect(written).toContain(CONTRACT);
		expect(violationsOf(root)).toEqual([]);
	});

	test("내용은 그대로이고 버전만 올라도 통과한다", () => {
		const root = cleanRoot();
		setVersion(root, CONTRACT, "2.0.0");
		expect(violationsOf(root)).toEqual([]);
	});

	test("버전이 x.y.z 가 아니면 형식 위반이다", () => {
		const root = cleanRoot();
		setVersion(root, CONTRACT, "1.0");
		expect(summary(violationsOf(root))).toEqual([`CV-no-version ${CONTRACT}`]);
	});

	test("lock 형식이 틀리면 형식 위반이다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/contract.lock.json`, '{ "version": "1.0.0" }\n');
		expect(summary(violationsOf(root))).toEqual([
			`CV-lock-invalid ${CONTRACT}`,
		]);
	});

	test("위반 상태 전체가 다섯 규칙을 모두 낸다", () => {
		const root = cleanRoot();
		rmSync(join(root, CONTRACT, "contract.lock.json"));
		put(root, `${KERNEL}/contract.lock.json`, "{}\n");
		const none = violationsOf(root).map((v) => v.rule);
		const second = cleanRoot();
		put(second, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		const notBumped = violationsOf(second).map((v) => v.rule);
		setVersion(second, CONTRACT, "1.1.0");
		const stale = violationsOf(second).map((v) => v.rule);
		setVersion(second, CONTRACT, "x");
		const noVersion = violationsOf(second).map((v) => v.rule);
		expect(new Set([...none, ...notBumped, ...stale, ...noVersion])).toEqual(
			new Set(CONTRACT_RULE_IDS),
		);
	});
});

describe("--update 가 위반을 지우지 않는다", () => {
	test("내용이 바뀌었는데 버전이 그대로면 lock 을 쓰지 않는다", () => {
		const root = cleanRoot();
		const lockPath = join(root, CONTRACT, "contract.lock.json");
		const before = readFileSync(lockPath, "utf8");
		put(root, `${CONTRACT}/src/index.ts`, "export type A = number;\n");
		const { written, refused } = updateLocks(root, loadTargets(root));
		expect(written).not.toContain(CONTRACT);
		expect(summary(refused)).toEqual([`CV-not-bumped ${CONTRACT}`]);
		expect(readFileSync(lockPath, "utf8")).toBe(before);
	});

	test("canWriteLock: lock 이 없으면 처음 만들 수 있다", () => {
		expect(
			canWriteLock({
				dir: CONTRACT,
				version: "0.1.0",
				hash: "h",
				lock: undefined,
			}),
		).toBe(true);
	});

	test("canWriteLock: 버전 형식이 틀리면 쓰지 않는다", () => {
		expect(
			canWriteLock({
				dir: CONTRACT,
				version: undefined,
				hash: "h",
				lock: undefined,
			}),
		).toBe(false);
	});
});

describe("해시 범위", () => {
	test("src·golden 밖의 파일(시험·문서·lock)은 해시에 들어가지 않는다", () => {
		const root = cleanRoot();
		const before = hashContract(root, CONTRACT);
		put(root, `${CONTRACT}/test/x.test.ts`, "export {};\n");
		put(root, `${CONTRACT}/README.md`, "설명\n");
		put(root, `${CONTRACT}/src/note.md`, "ts 가 아니다\n");
		expect(hashContract(root, CONTRACT)).toBe(before);
	});

	test("개행이 CRLF 로 바뀌어도 해시는 같다", () => {
		const root = cleanRoot();
		const before = hashContract(root, CONTRACT);
		put(root, `${CONTRACT}/src/index.ts`, "export type A = string;\r\n");
		expect(hashContract(root, CONTRACT)).toBe(before);
	});

	test("파일을 더하거나 이름을 바꾸면 해시가 바뀐다", () => {
		const root = cleanRoot();
		const before = hashContract(root, CONTRACT);
		put(root, `${CONTRACT}/src/more.ts`, "export {};\n");
		const added = hashContract(root, CONTRACT);
		expect(added).not.toBe(before);
		rmSync(join(root, CONTRACT, "src/more.ts"));
		put(root, `${CONTRACT}/src/other.ts`, "export {};\n");
		expect(hashContract(root, CONTRACT)).not.toBe(added);
	});
});

describe("명령줄", () => {
	test("깨끗한 루트는 종료 0 이고 대상 수를 찍는다", () => {
		const result = run(cleanRoot());
		expect(result.code).toBe(0);
		expect(result.out).toContain("대상 2 · 위반 0");
	});

	test("버전 미상승은 종료 1 이고 규칙 ID 를 출력한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/golden/a.v1.json`, '{ "a": 2 }\n');
		const result = run(root);
		expect(result.code).toBe(1);
		expect(result.out).toContain(`CV-not-bumped ${CONTRACT}`);
	});

	test("--update 는 버전을 올린 뒤에만 lock 을 갱신하고 그 뒤 검사가 통과한다", () => {
		const root = cleanRoot();
		put(root, `${CONTRACT}/golden/a.v1.json`, '{ "a": 2 }\n');
		expect(run(root, "--update").code).toBe(1);
		setVersion(root, CONTRACT, "1.1.0");
		expect(run(root, "--update").code).toBe(0);
		expect(run(root).code).toBe(0);
	});

	test("계약 패키지가 하나도 없는 루트는 검사 대상 0 으로 통과한다", () => {
		const root = mkdtempSync(join(tmpdir(), "contract-version-empty-"));
		roots.push(root);
		const result = run(root);
		expect(result.code).toBe(0);
		expect(result.out).toContain("검사 대상 0");
	});
});

describe("실저장소", () => {
	test("kernel·protocol·events-contract 가 대상이고 위반이 없다", () => {
		const targets = loadTargets(REPO.replace(/[\\/]$/, ""));
		expect(targets.map((t) => t.dir)).toEqual([
			"modules/events-contract",
			"packages/kernel",
			"packages/protocol",
		]);
		expect(judgeContract(targets)).toEqual([]);
	});
});
