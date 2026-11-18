// 종료 78 경계 시험(L3) — 자식 프로세스로 boot-probe.ts 를 실제로 실행해 종료 코드와 출력을 본다.
// 자식은 부모 환경을 상속하지 않는다(env 에 필요한 변수만). cwd 는 저장소 밖 임시 디렉토리라 .env 가 있어도 닿지 않는다.
// 센티널은 시험 실행 중에 만든다 — 소스 리터럴이면 자식의 오류 출력이 소스 줄을 찍을 때 새어 나온다.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// URL.pathname 은 퍼센트 인코딩이라 경로에 공백·한글이 있으면 자식이 파일을 못 찾는다 — fileURLToPath 로 디코딩한다.
const probe = fileURLToPath(
	new URL("./fixtures/boot-probe.ts", import.meta.url),
);
const TIMEOUT_MS = 20000;
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pf-config-"));
	tempDirs.push(dir);
	return dir;
}

function runProbe(sample: string, env: Record<string, string>) {
	const child = Bun.spawnSync(
		[process.execPath, "--no-env-file", probe, sample],
		{
			cwd: makeTempDir(),
			env,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 10000,
		},
	);
	return {
		exitCode: child.exitCode,
		stdout: child.stdout.toString(),
		stderr: child.stderr.toString(),
	};
}

describe("종료 78", () => {
	test(
		"B1 필수 누락이면 78 로 끝나고 stderr 에 누락 이름이 있다. 같은 실행의 비밀 값은 어디에도 없다",
		() => {
			const sentinel = crypto.randomUUID();
			const child = runProbe("apiLike", { OAUTH_STATE_SECRET: sentinel });
			expect(child.exitCode).toBe(78);
			expect(child.stderr).toContain("PUBLIC_ORIGIN");
			expect(child.stderr).toContain("GITHUB_CLIENT_SECRET");
			expect(child.stdout + child.stderr).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);

	test(
		"B2 비밀 형식 오류면 78 이고 이름은 있고 값은 없다",
		() => {
			const sentinel = crypto.randomUUID();
			const child = runProbe("workerLike", {
				DATABASE_URL: `::${sentinel}`,
			});
			expect(child.exitCode).toBe(78);
			expect(child.stderr).toContain("DATABASE_URL");
			expect(child.stdout + child.stderr).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);

	test(
		"B3 비밀을 _FILE(끝 CRLF)로 주면 종료 0 이고 요약에 비밀 이름만 있다",
		() => {
			const sentinel = crypto.randomUUID();
			const secretDir = makeTempDir();
			const secretPath = join(secretDir, "database_url");
			writeFileSync(secretPath, `postgres://u:${sentinel}@h:5432/db\r\n`);
			const child = runProbe("workerLike", { DATABASE_URL_FILE: secretPath });
			expect(child.exitCode).toBe(0);
			expect(child.stderr).toBe("");
			expect(JSON.parse(child.stdout)).toEqual({
				values: {
					APP_ENV: "development",
					LOG_LEVEL: "info",
					LEASE_SECONDS: 30,
					HANDLER_TIMEOUT_SECONDS: 10,
				},
				secretNames: ["DATABASE_URL"],
			});
			expect(child.stdout + child.stderr).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);
});
