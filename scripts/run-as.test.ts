// run-as(L2) — 환경 매핑은 순수 함수로, 실제 실행·종료 코드 전달은 `bun -e` 자식 프로세스로 잰다.
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { buildChildEnv } from "./run-as.ts";

const RUN_AS = fileURLToPath(new URL("./run-as.ts", import.meta.url));

describe("buildChildEnv", () => {
	const parent = {
		PATH: "/bin",
		APP_ENV: "test",
		DATABASE_URL_API: "postgres://api:SENTINEL-API@h/db",
		DATABASE_URL_MIGRATOR: "postgres://mig:SENTINEL-MIG@h/db",
	};

	test("자기 역할의 주소를 DATABASE_URL 로 주고 나머지 환경은 그대로 둔다", () => {
		const child = buildChildEnv(parent, "MIGRATOR");
		expect(child.ok).toBe(true);
		if (child.ok) {
			expect(child.env.DATABASE_URL).toBe("postgres://mig:SENTINEL-MIG@h/db");
			expect(child.env.PATH).toBe("/bin");
			expect(child.env.APP_ENV).toBe("test");
		}
	});

	test("다른 역할의 주소(비밀번호)는 자식 환경에 남지 않는다", () => {
		const child = buildChildEnv(parent, "MIGRATOR");
		expect(child.ok).toBe(true);
		if (child.ok) {
			expect(
				Object.keys(child.env).filter((k) => k.startsWith("DATABASE_URL_")),
			).toEqual([]);
			expect(JSON.stringify(child.env)).not.toContain("SENTINEL-API");
		}
	});

	test.each([undefined, ""])(
		"대상 변수가 %p 이면 변수 이름만 돌려준다",
		(value) => {
			const child = buildChildEnv(
				{ ...parent, DATABASE_URL_WORKER: value },
				"WORKER",
			);
			expect(child).toEqual({ ok: false, missing: "DATABASE_URL_WORKER" });
		},
	);
});

async function runAs(args: string[], env: Record<string, string>) {
	const proc = Bun.spawn([process.execPath, RUN_AS, ...args], {
		env: { PATH: process.env.PATH ?? "", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, code };
}

describe("run-as 실행", () => {
	test("자식은 DATABASE_URL 만 받고 자식의 종료 코드가 그대로 전달된다", async () => {
		const result = await runAs(
			[
				"API",
				"-e",
				"console.log(JSON.stringify(Object.keys(process.env).filter((k) => k.startsWith('DATABASE_URL')).sort())); process.exit(7)",
			],
			{
				DATABASE_URL_API: "postgres://api:p@h/db",
				DATABASE_URL_WORKER: "postgres://w:p@h/db",
			},
		);
		expect(result.code).toBe(7);
		expect(JSON.parse(result.stdout)).toEqual(["DATABASE_URL"]);
	});

	test("대상 변수가 없으면 78 이고 이름만 출력하며 자식을 띄우지 않는다", async () => {
		const result = await runAs(["MIGRATOR", "-e", "console.log('ran')"], {
			DATABASE_URL_API: "postgres://api:SENTINEL-PW@h/db",
		});
		expect(result.code).toBe(78);
		expect(result.stderr).toContain("DATABASE_URL_MIGRATOR");
		expect(result.stderr).not.toContain("SENTINEL-PW");
		expect(result.stdout).not.toContain("ran");
	});

	test.each([[[]], [["api", "x.ts"]], [["API"]]])(
		"사용법 오류는 2 다: %p",
		async (args) => {
			const result = await runAs(args, {
				DATABASE_URL_API: "postgres://a:p@h/db",
			});
			expect(result.code).toBe(2);
		},
	);
});
