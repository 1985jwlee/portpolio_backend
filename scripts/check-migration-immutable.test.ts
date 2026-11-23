// migration immutable 검사 시험 — 판정 순수 함수(L2)와 임시 git 저장소 왕복.
// 임시 저장소는 저장소 밖(os.tmpdir)이다 — 바깥 bun test 가 집어 가지 않게(scripts/bunfig-env.test.ts 와 같은 이유).
// 자식 git 에는 GIT_CONFIG_NOSYSTEM·HOME 을 임시 디렉토리로 준다 — 개발자의 전역 설정이 끼지 않게 한다.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	IMMUTABLE_RULE_IDS,
	type JournalEntry,
	judgeMigrationChanges,
	runImmutableCheck,
} from "./check-migration-immutable.ts";

const SQL = "modules/alpha/migrations/0000_init.sql";
const NEW_SQL = "modules/alpha/migrations/0001_next.sql";
const JOURNAL = "modules/alpha/migrations/meta/_journal.json";

// when 목록으로 저널 항목을 만든다 — idx 는 위치, tag 는 위치에서 파생한다.
function entries(...whens: number[]): JournalEntry[] {
	return whens.map((when, idx) => ({
		idx,
		tag: `${String(idx).padStart(4, "0")}_x`,
		when,
	}));
}

type Journals = Parameters<typeof judgeMigrationChanges>[0]["journals"];

function judge(
	changes: Array<{ status: string; path: string }>,
	base: JournalEntry[] | null,
	head: JournalEntry[] | null,
) {
	const journals: Journals = new Map([["alpha", { base, head }]]);
	return judgeMigrationChanges({ changes, journals });
}

function rulesOf(violations: ReadonlyArray<{ rule: string }>): string[] {
	return violations.map((violation) => violation.rule);
}

describe("judgeMigrationChanges", () => {
	test("추가만 있으면 통과한다", () => {
		expect(
			judge(
				[
					{ status: "A", path: NEW_SQL },
					{ status: "M", path: JOURNAL },
				],
				entries(10),
				entries(10, 20),
			),
		).toEqual([]);
	});

	test("변경이 없으면 통과한다", () => {
		expect(judge([], entries(10), entries(10))).toEqual([]);
	});

	test("적용된 .sql 을 수정하면 MI-sql-modified", () => {
		const violations = judge(
			[{ status: "M", path: SQL }],
			entries(10),
			entries(10),
		);
		expect(rulesOf(violations)).toEqual(["MI-sql-modified"]);
		expect(violations[0]?.path).toBe(SQL);
	});

	test("타입 변경(T)도 수정으로 본다", () => {
		expect(
			rulesOf(judge([{ status: "T", path: SQL }], entries(10), entries(10))),
		).toEqual(["MI-sql-modified"]);
	});

	test(".sql 을 삭제하면 MI-sql-deleted", () => {
		expect(
			rulesOf(judge([{ status: "D", path: SQL }], entries(10), entries(10))),
		).toEqual(["MI-sql-deleted"]);
	});

	test("이름 변경은 삭제+추가라 삭제 쪽이 걸린다", () => {
		const violations = judge(
			[
				{ status: "D", path: SQL },
				{ status: "A", path: "modules/alpha/migrations/0000_renamed.sql" },
			],
			entries(10),
			entries(10),
		);
		expect(rulesOf(violations)).toEqual(["MI-sql-deleted"]);
	});

	test("새 항목의 when 이 기준의 마지막과 같으면(경계) MI-journal-stale", () => {
		const violations = judge(
			[{ status: "M", path: JOURNAL }],
			entries(10, 20),
			entries(10, 20, 20),
		);
		expect(rulesOf(violations)).toEqual(["MI-journal-stale"]);
	});

	test("새 항목의 when 이 기준의 마지막보다 작으면 MI-journal-stale", () => {
		expect(
			rulesOf(
				judge(
					[{ status: "M", path: JOURNAL }],
					entries(10, 20),
					entries(10, 20, 15),
				),
			),
		).toEqual(["MI-journal-stale"]);
	});

	test("새 항목들끼리 순서가 뒤집히면 MI-journal-order", () => {
		expect(
			rulesOf(
				judge(
					[{ status: "M", path: JOURNAL }],
					entries(10),
					entries(10, 30, 25),
				),
			),
		).toEqual(["MI-journal-order"]);
	});

	test("기준 항목의 when 이 바뀌면 MI-journal-rewritten", () => {
		expect(
			rulesOf(
				judge(
					[{ status: "M", path: JOURNAL }],
					entries(10, 20),
					entries(10, 21),
				),
			),
		).toEqual(["MI-journal-rewritten"]);
	});

	test("기준 항목이 빠지면(HEAD 가 더 짧으면) MI-journal-rewritten", () => {
		expect(
			rulesOf(
				judge([{ status: "M", path: JOURNAL }], entries(10, 20), entries(10)),
			),
		).toEqual(["MI-journal-rewritten"]);
	});

	test("저널이 삭제되면 MI-journal-deleted", () => {
		expect(
			rulesOf(judge([{ status: "D", path: JOURNAL }], entries(10), null)),
		).toEqual(["MI-journal-deleted"]);
	});

	test("새 모듈은 증가 규칙만 본다 — 증가면 통과, 역순이면 MI-journal-order", () => {
		const changes = [
			{ status: "A", path: SQL },
			{ status: "A", path: JOURNAL },
		];
		expect(judge(changes, null, entries(1, 2))).toEqual([]);
		expect(rulesOf(judge(changes, null, entries(2, 1)))).toEqual([
			"MI-journal-order",
		]);
	});

	test("역슬래시 경로(Windows)도 정규화해 같은 판정을 한다", () => {
		const violations = judge(
			[{ status: "M", path: SQL.replaceAll("/", "\\") }],
			entries(10),
			entries(10),
		);
		expect(rulesOf(violations)).toEqual(["MI-sql-modified"]);
		expect(violations[0]?.path).toBe(SQL);
	});

	test("대상이 아닌 경로는 무시한다", () => {
		expect(
			judge(
				[
					{ status: "M", path: "modules/alpha/src/domain/x.ts" },
					{ status: "M", path: "modules/alpha/migrations/notes.md" },
					{ status: "D", path: "modules/alpha/migrations/sub/0000_x.sql" },
				],
				entries(10),
				entries(10),
			),
		).toEqual([]);
	});

	test("규칙 ID 는 여섯 개다", () => {
		expect([...IMMUTABLE_RULE_IDS].sort()).toEqual([
			"MI-journal-deleted",
			"MI-journal-order",
			"MI-journal-rewritten",
			"MI-journal-stale",
			"MI-sql-deleted",
			"MI-sql-modified",
		]);
	});
});

// ---- git 왕복 -------------------------------------------------------------

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pf-immutable-"));
	tempDirs.push(dir);
	return dir;
}

type Repo = {
	readonly root: string;
	git(...args: string[]): void;
	write(path: string, content: string): void;
	commit(message: string): void;
};

function makeRepo(): Repo {
	const root = makeTempDir();
	const home = makeTempDir();
	const env = {
		PATH: process.env.PATH ?? "",
		HOME: home,
		GIT_CONFIG_NOSYSTEM: "1",
	};
	const git = (...args: string[]) => {
		const child = Bun.spawnSync(
			[
				"git",
				"-c",
				"user.name=t",
				"-c",
				"user.email=t@example.com",
				"-c",
				"commit.gpgsign=false",
				...args,
			],
			{ cwd: root, env, stdout: "pipe", stderr: "pipe" },
		);
		if (child.exitCode !== 0) {
			throw new Error(`git ${args.join(" ")}: ${child.stderr.toString()}`);
		}
	};
	git("init", "-q", "-b", "main");
	return {
		root,
		git,
		write(path, content) {
			const full = join(root, path);
			mkdirSync(dirname(full), { recursive: true });
			writeFileSync(full, content);
		},
		commit(message) {
			git("add", "-A");
			git("commit", "-q", "-m", message);
		},
	};
}

function journalJson(entryList: JournalEntry[]): string {
	return JSON.stringify({
		version: "7",
		dialect: "postgresql",
		entries: entryList.map((entry) => ({
			...entry,
			version: "7",
			breakpoints: true,
		})),
	});
}

// 기준 커밋(main): alpha 0000 하나. 이어서 feature 가지로 간다.
function baseRepo(): Repo {
	const repo = makeRepo();
	repo.write(SQL, "CREATE SCHEMA alpha;\n");
	repo.write(JOURNAL, journalJson(entries(100)));
	repo.commit("base");
	repo.git("checkout", "-q", "-b", "feature");
	return repo;
}

const TIMEOUT_MS = 20000;

describe("runImmutableCheck (임시 git 저장소)", () => {
	test(
		"적용된 .sql 을 수정한 커밋은 MI-sql-modified",
		async () => {
			const repo = baseRepo();
			repo.write(SQL, "CREATE SCHEMA alpha_changed;\n");
			repo.commit("edit applied sql");
			const report = await runImmutableCheck(repo.root, "main");
			expect(report.ok).toBe(false);
			expect(rulesOf(report.violations)).toEqual(["MI-sql-modified"]);
			expect(report.counts).toEqual({ modules: 1, changes: 1 });
		},
		TIMEOUT_MS,
	);

	test(
		"새 항목을 정상으로 추가한 커밋은 통과한다",
		async () => {
			const repo = baseRepo();
			repo.write(NEW_SQL, "CREATE TABLE alpha.t (id int);\n");
			repo.write(JOURNAL, journalJson(entries(100, 200)));
			repo.commit("add next migration");
			const report = await runImmutableCheck(repo.root, "main");
			expect(report.violations).toEqual([]);
			expect(report.ok).toBe(true);
			expect(report.counts).toEqual({ modules: 1, changes: 2 });
		},
		TIMEOUT_MS,
	);

	test(
		"과거 when 의 새 항목은 MI-journal-stale",
		async () => {
			const repo = baseRepo();
			repo.write(NEW_SQL, "CREATE TABLE alpha.t (id int);\n");
			repo.write(JOURNAL, journalJson(entries(100, 50)));
			repo.commit("add migration with a past timestamp");
			const report = await runImmutableCheck(repo.root, "main");
			expect(rulesOf(report.violations)).toEqual(["MI-journal-stale"]);
		},
		TIMEOUT_MS,
	);

	test(
		"마이그레이션 변경이 없으면 변경 0 으로 통과한다",
		async () => {
			const repo = baseRepo();
			repo.write("modules/alpha/src/index.ts", "export {};\n");
			repo.commit("unrelated change");
			const report = await runImmutableCheck(repo.root, "main");
			expect(report.ok).toBe(true);
			expect(report.counts).toEqual({ modules: 0, changes: 0 });
		},
		TIMEOUT_MS,
	);

	test(
		"기준은 merge-base 다 — 기준 브랜치가 그 뒤에 한 변경은 이 가지의 위반이 아니다",
		async () => {
			const repo = baseRepo();
			repo.write(NEW_SQL, "CREATE TABLE alpha.t (id int);\n");
			repo.write(JOURNAL, journalJson(entries(100, 200)));
			repo.commit("add next migration");
			repo.git("checkout", "-q", "main");
			repo.write(SQL, "CREATE SCHEMA main_side_edit;\n");
			repo.commit("main edits applied sql");
			repo.git("checkout", "-q", "feature");
			const report = await runImmutableCheck(repo.root, "main");
			expect(report.violations).toEqual([]);
			expect(report.ok).toBe(true);
		},
		TIMEOUT_MS,
	);

	test(
		"기준 ref 가 없으면 던진다",
		async () => {
			const repo = baseRepo();
			await expect(
				runImmutableCheck(repo.root, "no-such-ref"),
			).rejects.toThrow();
		},
		TIMEOUT_MS,
	);
});
