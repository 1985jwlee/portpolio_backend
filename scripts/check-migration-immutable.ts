// migration immutable — 이미 적용된 마이그레이션이 바뀌지 않았는지 `merge-base(기준, HEAD)..HEAD` 의 커밋된 변경으로 본다(09-ci-cd.md §마이그레이션).
// 판정(순수 함수)과 git 호출(얇은 층)을 가른다. 작업 트리의 미커밋 변경은 보지 않는다 — PR 의 의미를 따른다.
// 한계: 저널 항목의 (idx·tag·when) 접두 일치만 본다. .sql 내용이 같은데 저널만 어긋난 경우의 의미 검증은 하지 않는다.
// 종료 코드: 0 위반 없음 · 1 위반 있음 또는 git 실패. 출력은 arch.ts 와 같은 `<규칙> <경로> (<사유>)` 줄 + 요약 한 줄.

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export type MigrationChange = {
	readonly status: string;
	readonly path: string;
};

export type JournalEntry = {
	readonly idx: number;
	readonly tag: string;
	readonly when: number;
};

export type ImmutableViolation = {
	readonly rule: string;
	readonly path: string;
	readonly detail: string;
};

export const IMMUTABLE_RULE_IDS: readonly string[] = [
	"MI-sql-modified",
	"MI-sql-deleted",
	"MI-journal-deleted",
	"MI-journal-rewritten",
	"MI-journal-order",
	"MI-journal-stale",
];

// ADR-052 배치 — 모듈 자기 폴더. 하위 폴더의 .sql 은 대상이 아니다.
const SQL_PATH = /^modules\/([^/]+)\/migrations\/[^/]+\.sql$/;
const JOURNAL_PATH = /^modules\/([^/]+)\/migrations\/meta\/_journal\.json$/;

type JournalPair = {
	readonly base: ReadonlyArray<JournalEntry> | null;
	readonly head: ReadonlyArray<JournalEntry> | null;
};

function normalize(path: string): string {
	return path.replaceAll("\\", "/");
}

function journalPathOf(module: string): string {
	return `modules/${module}/migrations/meta/_journal.json`;
}

function judgeSqlChange(change: MigrationChange): ImmutableViolation[] {
	const path = normalize(change.path);
	if (!SQL_PATH.test(path) || change.status === "A") {
		return [];
	}
	return change.status === "D"
		? [
				{
					rule: "MI-sql-deleted",
					path,
					detail: "적용된 마이그레이션을 삭제했다",
				},
			]
		: [
				{
					rule: "MI-sql-modified",
					path,
					detail: "적용된 마이그레이션을 수정했다",
				},
			];
}

function sameEntry(a: JournalEntry, b: JournalEntry): boolean {
	return a.idx === b.idx && a.tag === b.tag && a.when === b.when;
}

function judgeJournal(module: string, pair: JournalPair): ImmutableViolation[] {
	const path = journalPathOf(module);
	const { base, head } = pair;
	if (head === null) {
		return base === null
			? []
			: [{ rule: "MI-journal-deleted", path, detail: "저널을 삭제했다" }];
	}
	const baseCount = base?.length ?? 0;
	const violations: ImmutableViolation[] = [];
	// 적용된 항목의 (idx·tag·when) 이 바뀌면 그 마이그레이션이 재적용될 수 있다.
	for (let i = 0; i < baseCount; i += 1) {
		const before = base?.[i];
		const after = head[i];
		if (
			before === undefined ||
			after === undefined ||
			!sameEntry(before, after)
		) {
			violations.push({
				rule: "MI-journal-rewritten",
				path,
				detail: `기준 항목 ${i} 가 바뀌었거나 사라졌다`,
			});
			break;
		}
	}
	// 새 항목만 증가 규칙을 본다. 첫 새 항목은 기준의 마지막과, 나머지는 바로 앞 항목과 견준다.
	for (let i = Math.max(baseCount, 1); i < head.length; i += 1) {
		const previous = head[i - 1];
		const current = head[i];
		if (
			previous === undefined ||
			current === undefined ||
			current.when > previous.when
		) {
			continue;
		}
		violations.push({
			rule: i === baseCount ? "MI-journal-stale" : "MI-journal-order",
			path,
			detail: `항목 ${i} 의 when ${current.when} 이 앞 항목의 ${previous.when} 보다 크지 않다`,
		});
	}
	return violations;
}

/** 변경 목록과 모듈별 기준·HEAD 저널로 위반을 가린다. git 을 부르지 않는다. */
export function judgeMigrationChanges(input: {
	readonly changes: ReadonlyArray<MigrationChange>;
	readonly journals: ReadonlyMap<string, JournalPair>;
}): ImmutableViolation[] {
	const violations = input.changes.flatMap(judgeSqlChange);
	const touched = new Set<string>();
	for (const change of input.changes) {
		const path = normalize(change.path);
		const module = (SQL_PATH.exec(path) ?? JOURNAL_PATH.exec(path))?.[1];
		if (module !== undefined) {
			touched.add(module);
		}
	}
	for (const module of [...touched].sort()) {
		const pair = input.journals.get(module);
		if (pair !== undefined) {
			violations.push(...judgeJournal(module, pair));
		}
	}
	return violations;
}

// ---- git 층 ---------------------------------------------------------------

function git(
	repoRoot: string,
	args: string[],
): { exitCode: number; stdout: string; stderr: string } {
	const child = Bun.spawnSync(["git", "-c", "core.quotepath=false", ...args], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: child.exitCode,
		stdout: child.stdout.toString(),
		stderr: child.stderr.toString(),
	};
}

function mustGit(repoRoot: string, args: string[]): string {
	const result = git(repoRoot, args);
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} 실패: ${result.stderr.trim()}`);
	}
	return result.stdout;
}

// `-z` 출력은 `<상태>\0<경로>\0` 의 반복이다(--no-renames 라 경로는 항상 하나).
function parseNameStatus(output: string): MigrationChange[] {
	const parts = output.split("\0").filter((part) => part !== "");
	const changes: MigrationChange[] = [];
	for (let i = 0; i + 1 < parts.length; i += 2) {
		changes.push({ status: parts[i] ?? "", path: parts[i + 1] ?? "" });
	}
	return changes;
}

function isJournalEntry(value: unknown): value is JournalEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof Reflect.get(value, "idx") === "number" &&
		typeof Reflect.get(value, "tag") === "string" &&
		typeof Reflect.get(value, "when") === "number"
	);
}

// 그 커밋에 저널이 없으면 null(새 모듈·삭제). 있는데 읽을 수 없으면 던진다 — 조용히 통과시키지 않는다.
function readJournal(
	repoRoot: string,
	commit: string,
	path: string,
): JournalEntry[] | null {
	const shown = git(repoRoot, ["show", `${commit}:${path}`]);
	if (shown.exitCode !== 0) {
		return null;
	}
	const parsed: unknown = JSON.parse(shown.stdout);
	const list =
		typeof parsed === "object" && parsed !== null
			? Reflect.get(parsed, "entries")
			: undefined;
	if (!Array.isArray(list) || !list.every(isJournalEntry)) {
		throw new Error(`${commit}:${path} 의 저널 형식이 올바르지 않다`);
	}
	return list.map(({ idx, tag, when }) => ({ idx, tag, when }));
}

export async function runImmutableCheck(
	repoRoot: string,
	base: string,
): Promise<{
	readonly ok: boolean;
	readonly violations: ReadonlyArray<ImmutableViolation>;
	readonly mergeBase: string;
	readonly counts: { readonly modules: number; readonly changes: number };
}> {
	const mergeBase = mustGit(repoRoot, ["merge-base", base, "HEAD"]).trim();
	const diff = mustGit(repoRoot, [
		"diff",
		"--name-status",
		"--no-renames",
		"-z",
		mergeBase,
		"HEAD",
		"--",
		"modules",
	]);
	const changes = parseNameStatus(diff).filter((change) => {
		const path = normalize(change.path);
		return SQL_PATH.test(path) || JOURNAL_PATH.test(path);
	});
	const modules = new Set<string>();
	for (const change of changes) {
		const path = normalize(change.path);
		const module = (SQL_PATH.exec(path) ?? JOURNAL_PATH.exec(path))?.[1];
		if (module !== undefined) {
			modules.add(module);
		}
	}
	const journals = new Map<string, JournalPair>();
	for (const module of modules) {
		const path = journalPathOf(module);
		journals.set(module, {
			base: readJournal(repoRoot, mergeBase, path),
			head: readJournal(repoRoot, "HEAD", path),
		});
	}
	const violations = judgeMigrationChanges({ changes, journals });
	return {
		ok: violations.length === 0,
		violations,
		mergeBase,
		counts: { modules: modules.size, changes: changes.length },
	};
}

if (import.meta.main) {
	const repoRoot = fileURLToPath(new URL("../", import.meta.url));
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: { base: { type: "string", default: "main" } },
		strict: true,
	});
	// 예외는 잡지 않는다 — git 실패·형식 오류는 고장이고 Bun 이 종료 1 로 끝낸다.
	const report = await runImmutableCheck(repoRoot, values.base);
	for (const violation of report.violations) {
		console.log(`${violation.rule} ${violation.path} (${violation.detail})`);
	}
	console.log(
		`migration-immutable: 기준 ${values.base}(${report.mergeBase.slice(0, 7)}) · 모듈 ${report.counts.modules} · 변경 ${report.counts.changes} · 위반 ${report.violations.length}`,
	);
	process.exitCode = report.ok ? 0 : 1;
}
