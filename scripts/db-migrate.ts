// db:migrate — 설정 읽기 → 모듈 탐색·거르기 → roles.json 읽기 → 풀 → runMigrations → 종료 코드.
// 마이그레이션 로직은 packages/db 의 runMigrations 에 있고 이 파일에는 없다. 모듈 목록은 여기서 조립한다(ADR-052 결정 7).
// 종료 코드: 0 성공 · 1 실행·인자 오류 · 78 설정 오류(@pf/config 의 exitCodeFor). 연결 주소 같은 비밀은 출력하지 않는다.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
	defineSchema,
	exitCodeFor,
	FileBackedEnvSource,
	fields,
	loadConfig,
	ProcessEnvSource,
} from "@pf/config";
import { createDbPool, type MigrationModule, runMigrations } from "@pf/db";

const schema = defineSchema({ DATABASE_URL: fields.DATABASE_URL });

/** modules/<이름>/migrations/meta/_journal.json 이 있는 디렉토리를 이름순으로 모은다. 저널 없는 모듈은 마이그레이션이 없는 것이다. */
export async function discoverModules(
	repoRoot: string,
): Promise<MigrationModule[]> {
	const modulesDir = join(repoRoot, "modules");
	const entries = await readdir(modulesDir, { withFileTypes: true });
	const found: MigrationModule[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const folder = join(modulesDir, entry.name, "migrations");
		if (await Bun.file(join(folder, "meta", "_journal.json")).exists()) {
			found.push({ name: entry.name, folder });
		}
	}
	return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** 인자가 없으면 전부, 있으면 그 이름만(요청 순서·중복 제거). 모르는 이름이 하나라도 있으면 그 목록을 돌려준다. */
export function selectModules(
	found: ReadonlyArray<MigrationModule>,
	requested: ReadonlyArray<string>,
):
	| { readonly ok: true; readonly modules: ReadonlyArray<MigrationModule> }
	| { readonly ok: false; readonly unknown: ReadonlyArray<string> } {
	if (requested.length === 0) {
		return { ok: true, modules: found };
	}
	const unique = [...new Set(requested)];
	const unknown = unique.filter(
		(name) => !found.some((module) => module.name === name),
	);
	if (unknown.length > 0) {
		return { ok: false, unknown };
	}
	const modules = unique.flatMap((name) =>
		found.filter((module) => module.name === name),
	);
	return { ok: true, modules };
}

function parseModuleArgs(args: ReadonlyArray<string>): string[] | undefined {
	try {
		return parseArgs({
			args: [...args],
			options: {},
			allowPositionals: true,
			strict: true,
		}).positionals;
	} catch (error) {
		console.error(
			`db:migrate: ${error instanceof Error ? error.message : String(error)}`,
		);
		console.error("사용법: bun run db:migrate [모듈 이름…]");
		return undefined;
	}
}

async function readRoles(repoRoot: string): Promise<unknown> {
	return JSON.parse(
		await Bun.file(join(repoRoot, "packages", "db", "roles.json")).text(),
	);
}

async function main(args: ReadonlyArray<string>): Promise<number> {
	const repoRoot = fileURLToPath(new URL("../", import.meta.url));
	const requested = parseModuleArgs(args);
	if (requested === undefined) {
		return 1;
	}

	const loaded = loadConfig(
		schema,
		new FileBackedEnvSource(new ProcessEnvSource()),
	);
	if (!loaded.ok) {
		// 이름·사유만 낸다 — 값은 어디에도 실리지 않는다(@pf/config 계약).
		console.error(
			`db:migrate: 설정 오류 ${JSON.stringify(loaded.error.details)}`,
		);
		return exitCodeFor(loaded.error);
	}

	const selected = selectModules(await discoverModules(repoRoot), requested);
	if (!selected.ok) {
		console.error(`db:migrate: 모르는 모듈 ${selected.unknown.join(", ")}`);
		return 1;
	}

	let roles: unknown;
	try {
		roles = await readRoles(repoRoot);
	} catch (error) {
		console.error(
			`db:migrate: roles.json 을 읽을 수 없다 — ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}

	const pool = createDbPool({ url: loaded.value.config.DATABASE_URL.reveal() });
	try {
		const result = await runMigrations(pool, {
			modules: selected.modules,
			roles,
		});
		if (!result.ok) {
			const { message, details, cause } = result.error;
			console.error(`db:migrate: ${message} ${JSON.stringify(details)}`);
			if (cause instanceof Error) {
				console.error(`원인: ${cause.message}`);
			}
			return 1;
		}
	} finally {
		// 실행이 끝났으므로 기다릴 질의가 없다 — 기한은 닫기가 멈추지 않게 하는 상한이다.
		await pool.close(5_000);
	}

	console.log(
		selected.modules.length === 0
			? "db:migrate: 적용할 모듈 0"
			: `db:migrate: 적용 ${selected.modules.map((module) => module.name).join(", ")}`,
	);
	return 0;
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
