// db:migrate 의 DB 없는 시험 — 모듈 탐색·거르기(순수)와 연결 전에 끝나는 종료 코드(자식 프로세스).
// 성공 경로(실 DB)는 자동 시험이 아니라 검증 명령으로 L3 확인한다(계획 S13). 실행기 자체는 packages/db 의 통합 시험이 덮는다.
// 자식은 부모 환경을 상속하지 않고 필요한 변수만 받는다. cwd 는 저장소 밖 임시 디렉토리라 .env 가 있어도 닿지 않는다.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverModules, selectModules } from "./db-migrate.ts";

const script = fileURLToPath(new URL("./db-migrate.ts", import.meta.url));
const TIMEOUT_MS = 20000;
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pf-db-migrate-"));
	tempDirs.push(dir);
	return dir;
}

function runScript(args: string[], env: Record<string, string>) {
	const child = Bun.spawnSync(
		[process.execPath, "--no-env-file", script, ...args],
		{
			cwd: makeTempDir(),
			env,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 15000,
		},
	);
	return {
		exitCode: child.exitCode,
		output: child.stdout.toString() + child.stderr.toString(),
	};
}

const alpha = { name: "alpha", folder: "/m/alpha/migrations" };
const beta = { name: "beta", folder: "/m/beta/migrations" };
const found = [alpha, beta];

describe("selectModules", () => {
	test("인자가 없으면 전부다", () => {
		expect(selectModules(found, [])).toEqual({ ok: true, modules: found });
	});

	test("인자가 있으면 그것만, 요청 순서·중복 제거로 돌려준다", () => {
		expect(selectModules(found, ["beta", "beta"])).toEqual({
			ok: true,
			modules: [beta],
		});
		expect(selectModules(found, ["beta", "alpha"])).toEqual({
			ok: true,
			modules: [beta, alpha],
		});
	});

	test("모르는 이름이 하나라도 있으면 그 목록을 돌려준다", () => {
		expect(selectModules(found, ["alpha", "nope", "nada"])).toEqual({
			ok: false,
			unknown: ["nope", "nada"],
		});
	});
});

describe("discoverModules", () => {
	test("저널이 있는 모듈만 이름순으로 잡는다", async () => {
		const root = makeTempDir();
		const journal = (name: string) => {
			const meta = join(root, "modules", name, "migrations", "meta");
			mkdirSync(meta, { recursive: true });
			writeFileSync(join(meta, "_journal.json"), "{}");
		};
		journal("zeta");
		journal("alpha");
		// 저널이 없는 모듈과 디렉토리가 아닌 항목은 잡히지 않는다.
		mkdirSync(join(root, "modules", "nomigrations", "migrations"), {
			recursive: true,
		});
		writeFileSync(join(root, "modules", "README.md"), "x");

		const modules = await discoverModules(root);
		expect(modules.map((module) => module.name)).toEqual(["alpha", "zeta"]);
		expect(modules[0]?.folder).toBe(
			join(root, "modules", "alpha", "migrations"),
		);
	});
});

describe("db:migrate 종료 코드(연결 전)", () => {
	test(
		"DATABASE_URL 이 없으면 78 이고 이름만 출력한다",
		() => {
			const child = runScript([], {});
			expect(child.exitCode).toBe(78);
			expect(child.output).toContain("DATABASE_URL");
		},
		TIMEOUT_MS,
	);

	test(
		"모르는 모듈 이름이면 연결하기 전에 1 로 끝나고 비밀은 출력하지 않는다",
		() => {
			const sentinel = crypto.randomUUID();
			// 닿지 않는 주소 — 연결을 시도했다면 오류 문구가 달라지거나 시간이 걸린다.
			const child = runScript(["no_such_module"], {
				DATABASE_URL: `postgres://u:${sentinel}@127.0.0.1:1/none`,
			});
			expect(child.exitCode).toBe(1);
			expect(child.output).toContain("no_such_module");
			expect(child.output).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);

	test(
		"알 수 없는 플래그는 1 로 끝난다",
		() => {
			const child = runScript(["--bogus"], {
				DATABASE_URL: "postgres://u:p@127.0.0.1:1/none",
			});
			expect(child.exitCode).toBe(1);
		},
		TIMEOUT_MS,
	);

	test(
		"DB 에 닿지 못하면 1 로 끝나고 연결 문자열의 비밀은 출력하지 않는다",
		() => {
			const sentinel = crypto.randomUUID();
			const child = runScript([], {
				DATABASE_URL: `postgres://u:${sentinel}@127.0.0.1:1/none`,
			});
			expect(child.exitCode).toBe(1);
			expect(child.output).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);
});
