// 계약 버전 검사 — 계약 패키지의 내용이 바뀌었는데 package.json 의 버전이 오르지 않았으면 실패시킨다(ADR-052 결정 3, S1-18).
// 판정(judgeContract)은 파일을 읽지 않는 순수 함수이고, 파일을 읽어 판정 입력으로 바꾸는 일은 loadTargets 가 한다
// (check-classification.ts 와 같은 분리).
//
// 기준선은 패키지마다 `contract.lock.json`(`{ version, hash }`)이다. 해시는 `src/**/*.ts` 와 `golden/**/*.json` 의
// 정렬된 경로와 내용(개행 LF 정규화)의 sha256 이다. 버전을 올린 뒤 `--update` 로 lock 을 다시 쓴다.
// `--update` 는 내용이 바뀌었는데 버전이 오르지 않은 패키지의 lock 을 쓰지 않는다 — 그러지 않으면 `--update` 가 위반을 지운다.
//
// 대상: `modules/*-contract` · `packages/kernel` · `packages/protocol`(ADR-052 결정 3 의 "경계" 와 같은 층).
// 한계: 해시는 소스 바이트라 주석·서식만 바뀌어도 버전 상승을 요구한다(계약 패키지는 작아서 감수). 어느 변경이 하위 호환인지(minor/major)는
// 판정하지 않는다 — 오르기만 하면 통과한다. lock 은 사람이 읽는 파일이고, 손으로 고쳐 우회하는 것은 PR diff 에 보인다.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export type ContractLock = {
	readonly version: string;
	readonly hash: string;
};

export type ContractTarget = {
	/** 검사 루트 기준 패키지 디렉토리(`/` 구분). */
	readonly dir: string;
	/** package.json 의 version. 없거나 읽을 수 없으면 undefined. */
	readonly version: string | undefined;
	/** 현재 소스의 해시. */
	readonly hash: string;
	/** lock 파일: 없으면 undefined, 있는데 형식이 틀리면 "invalid". */
	readonly lock: ContractLock | "invalid" | undefined;
};

export type ContractViolation = {
	readonly rule: string;
	readonly dir: string;
	readonly detail: string;
};

export const CONTRACT_RULE_IDS: readonly string[] = [
	"CV-no-version",
	"CV-no-lock",
	"CV-lock-invalid",
	"CV-not-bumped",
	"CV-lock-stale",
];

const LOCK_FILE = "contract.lock.json";
const FIXED_TARGETS = ["packages/kernel", "packages/protocol"];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(
	value: string,
): readonly [number, number, number] | undefined {
	const match = SEMVER.exec(value);
	if (match === null) {
		return undefined;
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** a 가 b 보다 크면 양수, 같으면 0, 작으면 음수. 둘 다 x.y.z 라고 가정한다. */
function compareSemver(a: string, b: string): number {
	const left = parseSemver(a);
	const right = parseSemver(b);
	if (left === undefined || right === undefined) {
		return 0;
	}
	for (let i = 0; i < 3; i += 1) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) {
			return diff;
		}
	}
	return 0;
}

function judgeTarget(target: ContractTarget): ContractViolation[] {
	const { dir, version, hash, lock } = target;
	if (version === undefined || parseSemver(version) === undefined) {
		return [
			{
				rule: "CV-no-version",
				dir,
				detail: "package.json 에 x.y.z 형식의 version 이 없다",
			},
		];
	}
	if (lock === undefined) {
		return [
			{
				rule: "CV-no-lock",
				dir,
				detail: `${LOCK_FILE} 이 없다 — 버전을 확인한 뒤 --update 로 만든다`,
			},
		];
	}
	if (lock === "invalid") {
		return [
			{
				rule: "CV-lock-invalid",
				dir,
				detail: `${LOCK_FILE} 이 { version: x.y.z, hash: 문자열 } 형식이 아니다`,
			},
		];
	}
	if (hash === lock.hash) {
		return [];
	}
	if (compareSemver(version, lock.version) <= 0) {
		return [
			{
				rule: "CV-not-bumped",
				dir,
				detail: `계약이 바뀌었는데 버전이 오르지 않았다(lock ${lock.version}, 현재 ${version})`,
			},
		];
	}
	return [
		{
			rule: "CV-lock-stale",
			dir,
			detail: `버전은 올랐지만 ${LOCK_FILE} 이 갱신되지 않았다(lock ${lock.version}, 현재 ${version}) — --update 로 갱신한다`,
		},
	];
}

/** 대상마다 위반을 가린다. 파일을 읽지 않는다. */
export function judgeContract(
	targets: ReadonlyArray<ContractTarget>,
): ContractViolation[] {
	return targets.flatMap(judgeTarget);
}

/** `--update` 가 lock 을 쓸 수 있는 대상인가. 내용이 바뀌었는데 버전이 안 올랐으면 쓰지 않는다. */
export function canWriteLock(target: ContractTarget): boolean {
	const { version, lock, hash } = target;
	if (version === undefined || parseSemver(version) === undefined) {
		return false;
	}
	if (lock === undefined || lock === "invalid" || hash === lock.hash) {
		return true;
	}
	return compareSemver(version, lock.version) > 0;
}

// ---- 파일 층 --------------------------------------------------------------

function listFiles(
	root: string,
	dir: string,
	extension: string,
	out: string[],
): void {
	if (!existsSync(`${root}/${dir}`)) {
		return;
	}
	for (const entry of readdirSync(`${root}/${dir}`, { withFileTypes: true })) {
		if (entry.name === "node_modules") {
			continue;
		}
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) {
			listFiles(root, path, extension, out);
		} else if (entry.name.endsWith(extension)) {
			out.push(path);
		}
	}
}

/** `src/**\/*.ts` 와 `golden/**\/*.json` 의 정렬된 경로와 내용(LF 정규화)을 sha256 으로 접는다. */
export function hashContract(root: string, packageDir: string): string {
	const files: string[] = [];
	listFiles(root, `${packageDir}/src`, ".ts", files);
	listFiles(root, `${packageDir}/golden`, ".json", files);
	// 코드 단위 순서로 정렬한다 — 로캘에 따라 달라지는 localeCompare 를 쓰지 않는다(기본 sort 가 코드 단위 순서다).
	files.sort();
	const hash = createHash("sha256");
	for (const file of files) {
		const content = readFileSync(`${root}/${file}`, "utf8").replaceAll(
			"\r\n",
			"\n",
		);
		hash.update(`${file.slice(packageDir.length + 1)}\0${content}\0`);
	}
	return hash.digest("hex");
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function readVersion(path: string): string | undefined {
	const json = readJson(path);
	if (typeof json !== "object" || json === null) {
		return undefined;
	}
	const version = Reflect.get(json, "version");
	return typeof version === "string" ? version : undefined;
}

function readLock(path: string): ContractLock | "invalid" | undefined {
	if (!existsSync(path)) {
		return undefined;
	}
	const json = readJson(path);
	if (typeof json !== "object" || json === null) {
		return "invalid";
	}
	const version = Reflect.get(json, "version");
	const hash = Reflect.get(json, "hash");
	if (
		typeof version === "string" &&
		parseSemver(version) !== undefined &&
		typeof hash === "string" &&
		hash !== ""
	) {
		return { version, hash };
	}
	return "invalid";
}

/** 검사 루트에서 대상 패키지 디렉토리를 모은다. 없는 고정 대상은 건너뛴다(픽스처 루트). */
export function targetDirs(root: string): string[] {
	const dirs: string[] = [];
	if (existsSync(`${root}/modules`)) {
		for (const entry of readdirSync(`${root}/modules`, {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() && entry.name.endsWith("-contract")) {
				dirs.push(`modules/${entry.name}`);
			}
		}
	}
	for (const dir of FIXED_TARGETS) {
		if (existsSync(`${root}/${dir}`)) {
			dirs.push(dir);
		}
	}
	return dirs.sort();
}

export function loadTargets(root: string): ContractTarget[] {
	return targetDirs(root).map((dir) => ({
		dir,
		version: readVersion(`${root}/${dir}/package.json`),
		hash: hashContract(root, dir),
		lock: readLock(`${root}/${dir}/${LOCK_FILE}`),
	}));
}

export function formatViolation(v: ContractViolation): string {
	return `${v.rule} ${v.dir} (${v.detail})`;
}

/** lock 을 쓴다. 쓸 수 없는 대상(버전 형식 오류·버전 미상승)은 건너뛰고 위반으로 돌려준다. */
export function updateLocks(
	root: string,
	targets: ReadonlyArray<ContractTarget>,
): { written: string[]; refused: ContractViolation[] } {
	const written: string[] = [];
	const refused: ContractViolation[] = [];
	for (const target of targets) {
		if (!canWriteLock(target)) {
			refused.push(...judgeTarget(target));
			continue;
		}
		if (target.version === undefined) {
			continue;
		}
		const lock: ContractLock = { version: target.version, hash: target.hash };
		writeFileSync(
			join(root, target.dir, LOCK_FILE),
			`${JSON.stringify(lock, null, "\t")}\n`,
		);
		written.push(target.dir);
	}
	return { written, refused };
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: { update: { type: "boolean", default: false } },
		allowPositionals: true,
	});
	const root = (
		positionals[0] ?? fileURLToPath(new URL("../", import.meta.url))
	).replace(/[\\/]$/, "");
	const targets = loadTargets(root);
	if (values.update) {
		const { written, refused } = updateLocks(root, targets);
		for (const violation of refused) {
			console.log(formatViolation(violation));
		}
		console.log(
			`check:contract-version --update: 갱신 ${written.length} · 거절 ${refused.length}`,
		);
		process.exitCode = refused.length === 0 ? 0 : 1;
	} else {
		const violations = judgeContract(targets);
		for (const violation of violations) {
			console.log(formatViolation(violation));
		}
		console.log(
			targets.length === 0
				? "check:contract-version: 검사 대상 0 (계약 패키지 없음)"
				: `check:contract-version: 대상 ${targets.length} · 위반 ${violations.length}`,
		);
		process.exitCode = violations.length === 0 ? 0 : 1;
	}
}
