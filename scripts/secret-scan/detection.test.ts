// 비밀 검출 시험(L3, AC-027) — 실제 gitleaks 바이너리가 .gitleaks.toml 로 합성 비밀을 잡고 정상 저장소는 통과시키는지 본다.
// 바이너리가 없으면 건너뛰지 않고 실패한다 — 조용히 통과하는 비밀 검사가 가장 나쁘다. 그래서 `bun test` 기본 수집에서 빼고(bunfig.toml)
// CI `secret-scan` 잡이 `bun run test:secret-scan` 으로 직접 돌린다. 이 호스트에는 gitleaks 가 없어 실행하지 못했다.
// 합성 비밀은 저장소에 커밋하지 않고 시험이 임시 저장소에만 쓴다. 소스에는 리터럴이 남지 않게 실행 시 조합한다(이 파일도 이력 검사를 받는다).
import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GITLEAKS = process.env.GITLEAKS_BIN ?? "gitleaks";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONFIG = join(ROOT, ".gitleaks.toml");

// 합성 비밀 3종 — 형식만 맞고 어디에도 유효하지 않다.
const DISCORD = `https://discord.com/api/webhooks/${"1".repeat(18)}/${"aB3_-xY9".repeat(9)}`;
const AWS_KEY = ["AKIA", "QWERTYUIOP", "ASDFGH"].join("");
const PAT_SUFFIX = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const GITHUB_PAT = `ghp_${PAT_SUFFIX}`;

const workdirs: string[] = [];
afterAll(() => {
	for (const dir of workdirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// 사용자·시스템 git 설정(훅 경로·서명 등)이 시험 저장소에 새지 않게 막는다.
// 빈 설정 파일을 가리킨다 — Windows 의 널 장치 경로(NUL)는 git 이 받지 못한다.
const EMPTY_GITCONFIG = join(
	mkdtempSync(join(tmpdir(), "pf-gitconfig-")),
	"gitconfig",
);
writeFileSync(EMPTY_GITCONFIG, "");
workdirs.push(dirname(EMPTY_GITCONFIG));
const GIT_ENV = {
	...process.env,
	GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG,
	GIT_CONFIG_NOSYSTEM: "1",
};

function run(cmd: string[], cwd: string): { code: number; output: string } {
	const result = Bun.spawnSync(cmd, { cwd, env: GIT_ENV });
	return {
		code: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function git(repo: string, ...args: string[]): void {
	const result = run(
		[
			"git",
			"-c",
			"user.name=pf-test",
			"-c",
			"user.email=pf-test@example.invalid",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		repo,
	);
	if (result.code !== 0) {
		throw new Error(`git ${args.join(" ")} 실패: ${result.output}`);
	}
}

function newRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), "pf-secret-scan-"));
	workdirs.push(repo);
	git(repo, "init", "-q", "-b", "main");
	return repo;
}

/** 파일 하나를 쓰고(없는 폴더는 만든다) 커밋 하나로 남긴다. */
function commit(repo: string, files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		const full = join(repo, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
		git(repo, "add", path);
	}
	git(
		repo,
		"commit",
		"-q",
		"-m",
		`시험 커밋: ${Object.keys(files).join(", ")}`,
	);
}

type Finding = { readonly RuleID: string; readonly File: string };
type Scan = {
	readonly exitCode: number;
	readonly output: string;
	readonly report: string;
	readonly findings: Finding[];
};

// 저장소 이력을 설정 파일과 함께 검사한다(CI 와 같은 `git` 모드·`--redact`). 보고서는 저장소 밖에 쓴다.
function scan(repo: string): Scan {
	const reportDir = mkdtempSync(join(tmpdir(), "pf-secret-report-"));
	workdirs.push(reportDir);
	const reportPath = join(reportDir, "report.json");
	const result = run(
		[
			GITLEAKS,
			"git",
			"--config",
			CONFIG,
			"--redact",
			"--exit-code",
			"1",
			"--no-banner",
			"--report-format",
			"json",
			"--report-path",
			reportPath,
			repo,
		],
		repo,
	);
	const report = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
	const parsed: unknown = report.trim() === "" ? [] : JSON.parse(report);
	const findings = Array.isArray(parsed)
		? parsed.flatMap((item: unknown) =>
				typeof item === "object" && item !== null
					? [
							{
								RuleID: String(Reflect.get(item, "RuleID")),
								File: String(Reflect.get(item, "File")),
							},
						]
					: [],
			)
		: [];
	return { exitCode: result.code, output: result.output, report, findings };
}

const rulesOf = (found: Scan) => new Set(found.findings.map((f) => f.RuleID));

describe("gitleaks 바이너리", () => {
	test("실행되고 8.30.1 이다 — 버전이 어긋나면 이 설정의 문법을 보장하지 못한다", () => {
		const result = run([GITLEAKS, "version"], ROOT);
		expect(result.code).toBe(0);
		expect(result.output.trim()).toContain("8.30.1");
	});
});

describe("비밀 검출", () => {
	test("합성 비밀 3종을 각각 다른 커밋에 넣으면 종료 1 이고 세 규칙이 모두 검출된다", () => {
		const repo = newRepo();
		commit(repo, { "src/notify.ts": `export const hook = "${DISCORD}";\n` });
		commit(repo, { "config/aws.ini": `aws_access_key_id = ${AWS_KEY}\n` });
		commit(repo, { "scripts/deploy.sh": `export GH_PAT="${GITHUB_PAT}"\n` });

		const found = scan(repo);

		expect(found.exitCode).toBe(1);
		expect(rulesOf(found)).toContain("discord-webhook-url");
		expect(rulesOf(found)).toContain("aws-access-token");
		expect(rulesOf(found)).toContain("github-pat");
		// 규칙마다 검출된 파일이 그 비밀을 넣은 파일이다 — 다른 이유로 우연히 걸린 것이 아니다.
		const fileOf = (rule: string) =>
			found.findings.find((f) => f.RuleID === rule)?.File;
		expect(fileOf("discord-webhook-url")).toBe("src/notify.ts");
		expect(fileOf("aws-access-token")).toBe("config/aws.ini");
		expect(fileOf("github-pat")).toBe("scripts/deploy.sh");
	});

	test("--redact 는 출력과 보고서에 비밀을 남기지 않는다(CI 로그로 새지 않는다)", () => {
		const repo = newRepo();
		commit(repo, { "a.ts": `export const hook = "${DISCORD}";\n` });
		commit(repo, { "b.ini": `aws_access_key_id = ${AWS_KEY}\n` });
		commit(repo, { "c.sh": `export GH_PAT="${GITHUB_PAT}"\n` });

		const found = scan(repo);

		expect(found.exitCode).toBe(1);
		for (const secret of [DISCORD, AWS_KEY, GITHUB_PAT]) {
			expect(found.output).not.toContain(secret);
			expect(found.report).not.toContain(secret);
		}
	});

	test("비밀을 지우는 커밋을 더해도 이력에 남은 비밀은 검출된다", () => {
		const repo = newRepo();
		commit(repo, { "config/aws.ini": `aws_access_key_id = ${AWS_KEY}\n` });
		commit(repo, { "config/aws.ini": "aws_access_key_id = removed\n" });

		const found = scan(repo);

		expect(found.exitCode).toBe(1);
		expect(rulesOf(found)).toContain("aws-access-token");
	});

	test("비밀이 없는 커밋만 있으면 종료 0 이고 검출이 없다(대조)", () => {
		const repo = newRepo();
		commit(repo, { "README.md": "# 시험 저장소\n" });
		commit(repo, { "src/main.ts": "export const answer = 42;\n" });

		const found = scan(repo);

		expect(found.exitCode).toBe(0);
		expect(found.findings).toEqual([]);
	});
});

describe("허용 목록", () => {
	test("저장소의 실제 .env.example 과 ci.yml 은 통과한다", () => {
		const repo = newRepo();
		commit(repo, {
			".env.example": readFileSync(join(ROOT, ".env.example"), "utf8"),
			".github/workflows/ci.yml": readFileSync(
				join(ROOT, ".github/workflows/ci.yml"),
				"utf8",
			),
		});

		const found = scan(repo);

		expect(found.findings).toEqual([]);
		expect(found.exitCode).toBe(0);
	});

	test("허용된 파일에 진짜 비밀이 들어오면 여전히 검출된다(경로만으로 숨기지 않는다)", () => {
		const repo = newRepo();
		const placeholder = readFileSync(join(ROOT, ".env.example"), "utf8");
		commit(repo, {
			".env.example": `${placeholder}GH_PAT=${GITHUB_PAT}\n`,
		});

		const found = scan(repo);

		expect(found.exitCode).toBe(1);
		expect(
			found.findings.some(
				(f) => f.RuleID === "github-pat" && f.File === ".env.example",
			),
		).toBe(true);
	});

	test("허용된 자리표시자 줄에 비밀을 얹으면 검출된다(줄 전체가 같아야 숨긴다)", () => {
		const repo = newRepo();
		const placeholder = readFileSync(join(ROOT, ".env.example"), "utf8");
		const edited = placeholder.replace(
			/^(DATABASE_URL_API=.*)$/m,
			`$1 ${GITHUB_PAT}`,
		);
		expect(edited).not.toBe(placeholder);
		commit(repo, { ".env.example": edited });

		const found = scan(repo);

		expect(found.exitCode).toBe(1);
	});
});
