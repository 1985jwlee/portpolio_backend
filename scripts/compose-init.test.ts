// compose init 스크립트(L2) — docker·Postgres 없이 가짜 psql 로 "어떤 SQL 이 어떤 인자와 함께 나가는가" 를 잰다.
// 실제 init(빈 볼륨 → 역할 생성 → db:migrate 종료 0)은 이 호스트에서 불가(docker 부재)라 사람 확인이다 — 검증 계획 4절.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INIT = join(ROOT, "infra", "compose", "init", "01-roles.sh");
const REAL_ROLES = join(ROOT, "packages", "db", "roles.json");

let work: string;
let fakeBin: string;
let log: string;

beforeAll(async () => {
	work = await mkdtemp(join(tmpdir(), "pf-compose-init-"));
	fakeBin = join(work, "bin");
	log = join(work, "psql.log");
	await Bun.write(
		join(fakeBin, "psql"),
		'#!/bin/sh\nprintf "ARGS: %s\\n" "$*" >> "$PSQL_LOG"\ncat >> "$PSQL_LOG"\n',
	);
	await chmod(join(fakeBin, "psql"), 0o755);
});

afterAll(async () => {
	await rm(work, { recursive: true, force: true });
});

async function runInit(options: {
	rolesFile: string;
	password?: string;
}): Promise<{ code: number; stderr: string; sql: string }> {
	await writeFile(log, "");
	const proc = Bun.spawn(["sh", INIT], {
		env: {
			PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
			PSQL_LOG: log,
			POSTGRES_USER: "postgres",
			POSTGRES_DB: "pf",
			PF_ROLES_FILE: options.rolesFile,
			...(options.password === undefined
				? {}
				: { PF_DEV_DB_PASSWORD: options.password }),
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stderr, code] = await Promise.all([
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stderr, sql: await Bun.file(log).text() };
}

async function rolesFile(content: string): Promise<string> {
	const path = join(work, `roles-${crypto.randomUUID()}.json`);
	await writeFile(path, content);
	return path;
}

describe("01-roles.sh", () => {
	test("roles.json 의 역할 전부와 pf_migrator 를 만들고 migrator 에 CREATE 를 준다", async () => {
		const result = await runInit({
			rolesFile: REAL_ROLES,
			password: "SENTINEL-PW",
		});
		expect(result.code).toBe(0);
		const spec = JSON.parse(await Bun.file(REAL_ROLES).text()) as {
			roles: string[];
		};
		// 정본(JSON)과 스크립트가 읽은 목록이 같다 — 셸 파싱이 갈라지면 여기서 빨강이 된다.
		const created = [...result.sql.matchAll(/create role "([^"]+)"/g)].map(
			(match) => match[1],
		);
		expect(created).toEqual([...spec.roles, "pf_migrator"]);
		expect(result.sql).toContain(
			'grant create on database "pf" to pf_migrator',
		);
	});

	test("비밀번호는 psql 변수로만 넘어가고 SQL 본문에 실리지 않는다", async () => {
		const result = await runInit({
			rolesFile: REAL_ROLES,
			password: "SENTINEL-PW",
		});
		expect(result.sql).toContain("-v pw=SENTINEL-PW");
		expect(result.sql).toContain("password :'pw'");
		const body = result.sql
			.split("\n")
			.filter((line) => !line.startsWith("ARGS:"))
			.join("\n");
		expect(body).not.toContain("SENTINEL-PW");
	});

	test("PF_DEV_DB_PASSWORD 가 없으면 1 로 끝나고 psql 을 부르지 않는다", async () => {
		const result = await runInit({ rolesFile: REAL_ROLES });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("PF_DEV_DB_PASSWORD 가 없다");
		expect(result.sql).toBe("");
	});

	test("비밀번호가 빈 문자열이어도 1 로 끝나고 psql 을 부르지 않는다(unset 과 다른 경로)", async () => {
		const result = await runInit({ rolesFile: REAL_ROLES, password: "" });
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("PF_DEV_DB_PASSWORD 가 없다");
		expect(result.sql).toBe("");
	});

	test.each([
		["대문자", '{ "roles": ["Pf_Api"] }'],
		["하이픈", '{ "roles": ["pf-api"] }'],
		["따옴표 주입", '{ "roles": ["pf_api\\";drop table x;--"] }'],
		["숫자 시작", '{ "roles": ["1pf"] }'],
	])(
		"규칙에 맞지 않는 역할 이름(%s)은 1 로 끝나고 아무 SQL 도 나가지 않는다",
		async (_name, content) => {
			const result = await runInit({
				rolesFile: await rolesFile(content),
				password: "pw",
			});
			expect(result.code).toBe(1);
			expect(result.sql).toBe("");
		},
	);

	test("roles 를 읽지 못하면 1 로 끝난다", async () => {
		const result = await runInit({
			rolesFile: await rolesFile('{ "tables": {} }'),
			password: "pw",
		});
		expect(result.code).toBe(1);
		expect(result.sql).toBe("");
	});
});
