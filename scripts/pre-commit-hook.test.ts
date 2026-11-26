// .githooks/pre-commit 시험(L2, AC-027) — gitleaks 가 없을 때의 안내·통과와, 있을 때의 인자 전달·종료 코드 전달을 본다.
// 실제 gitleaks 대신 PATH 에 가짜 실행 파일을 둔다 — 훅의 책임은 "찾아서 넘기고 결과를 그대로 돌려주는 것" 까지다.
import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../.githooks/pre-commit", import.meta.url));
const SH = Bun.which("sh");

type HookRun = {
	readonly exitCode: number;
	readonly stderr: string;
};

// PATH 를 `pathDirs` 만으로 좁혀 훅을 실행한다. 훅은 셸 내장 명령(command -v·echo·exec)만 쓰므로 `sh` 하나면 된다.
async function runHook(pathDirs: readonly string[]): Promise<HookRun> {
	if (SH === null) {
		throw new Error(
			"sh 가 없다 — 훅 시험은 POSIX 셸이 필요하다(Windows 는 Git Bash)",
		);
	}
	const proc = Bun.spawn([SH, HOOK], {
		env: { PATH: pathDirs.join(":") },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stderr, exitCode] = await Promise.all([
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stderr };
}

// 인자를 파일에 적고 정해진 코드로 끝나는 가짜 gitleaks 를 만든다.
function fakeGitleaks(dir: string, exitCode: number): string {
	const argsFile = join(dir, "args.txt");
	const script = join(dir, "gitleaks");
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile.replaceAll("\\", "/")}'\nexit ${exitCode}\n`,
	);
	chmodSync(script, 0o755);
	return argsFile;
}

describe("pre-commit 훅", () => {
	test("gitleaks 가 없으면 안내를 stderr 에 내고 통과시킨다(강제가 아니다)", async () => {
		const empty = mkdtempSync(join(tmpdir(), "pf-hook-"));
		try {
			const run = await runHook([empty]);
			expect(run.exitCode).toBe(0);
			expect(run.stderr).toContain("gitleaks");
			expect(run.stderr).toContain("secret-scan");
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	test("gitleaks 가 있으면 스테이징 검사 인자로 부르고 그 종료 코드를 그대로 돌려준다", async () => {
		const bin = mkdtempSync(join(tmpdir(), "pf-hook-"));
		try {
			const argsFile = fakeGitleaks(bin, 7);
			const run = await runHook([bin]);
			// 7 은 가짜 gitleaks 의 코드다 — 훅이 0 으로 덮으면 검출돼도 커밋이 통과한다.
			expect(run.exitCode).toBe(7);
			const args = readFileSync(argsFile, "utf8").trim().split("\n");
			expect(args).toEqual([
				"git",
				"--pre-commit",
				"--staged",
				"--redact",
				"--config",
				".gitleaks.toml",
			]);
		} finally {
			rmSync(bin, { recursive: true, force: true });
		}
	});

	test("gitleaks 가 0 으로 끝나면 훅도 0 이다", async () => {
		const bin = mkdtempSync(join(tmpdir(), "pf-hook-"));
		try {
			fakeGitleaks(bin, 0);
			expect((await runHook([bin])).exitCode).toBe(0);
		} finally {
			rmSync(bin, { recursive: true, force: true });
		}
	});
});
