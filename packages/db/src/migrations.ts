// 모듈별 마이그레이션 실행기 — 받은 모듈 목록을 받은 순서대로 순방향 적용하고, 끝에 권한을 적용한다.
// 모듈 탐색·설정 읽기는 이 파일의 책임이 아니다(scripts/db-migrate.ts). 롤백(down)은 없다.
import { PermanentError, Result } from "@pf/kernel";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import {
	currentUserQuery,
	grantStatements,
	ownedSchemasQuery,
} from "./adapter/postgres/raw/grants.ts";
import {
	acquireMigrationLock,
	releaseMigrationLock,
} from "./adapter/postgres/raw/migration-lock.ts";
import { type DbPool, handleOf } from "./pool.ts";
import { parseRolesSpec, type RolesSpec } from "./roles-spec.ts";

export type MigrationModule = {
	readonly name: string;
	readonly folder: string;
};

// 모든 모듈의 이력은 한 스키마에 두고 표 이름이 모듈 이름이다 — 기본 이력 표를 공유하면 역순 적용에서 모듈을 건너뛴다.
const MIGRATIONS_SCHEMA = "pf_migrations";
const MODULE_NAME = /^[a-z][a-z0-9_]*$/;
// 잠금이 예약한 연결 1개 + 같은 풀에서 마이그레이터·권한 적용이 얻는 연결 1개다.
const MIN_POOL_CONNECTIONS = 2;

type Db = BunSQLDatabase<Record<string, never>>;

function moduleError(
	module: string,
	message: string,
	cause?: unknown,
): Result<never, PermanentError> {
	return Result.err(
		new PermanentError({
			message,
			details: { module },
			...(cause === undefined ? {} : { cause }),
		}),
	);
}

// DB 입출력보다 먼저 끝나야 한다 — 이름이 틀렸는데 연결부터 하지 않는다.
function validateModules(
	modules: ReadonlyArray<MigrationModule>,
): Result<void, PermanentError> {
	const seen = new Set<string>();
	for (const { name } of modules) {
		if (!MODULE_NAME.test(name)) {
			return moduleError(name, "모듈 이름 형식이 올바르지 않다");
		}
		if (seen.has(name)) {
			return moduleError(name, "모듈 이름이 중복이다");
		}
		seen.add(name);
	}
	return Result.ok(undefined);
}

// 풀 상한이 2 미만이면 예약 연결이 풀을 다 쥐어 작업이 영원히 기다린다 — 잠금을 쥔 채 출력 없이 멈추므로 연결 전에 거절한다.
// 상한을 지정하지 않으면 Bun.SQL 기본값(10)이라 통과한다.
function validatePoolSize(client: Bun.SQL): Result<void, PermanentError> {
	const max = client.options.max;
	if (max !== undefined && max < MIN_POOL_CONNECTIONS) {
		return Result.err(
			new PermanentError({
				message: `마이그레이션 실행기는 연결 ${MIN_POOL_CONNECTIONS}개(잠금 1 + 작업 1)가 필요하다 — DATABASE_URL 의 max 를 ${MIN_POOL_CONNECTIONS} 이상으로 한다`,
				details: { stage: "pool", max },
			}),
		);
	}
	return Result.ok(undefined);
}

// 모듈 안의 실패는 그 모듈의 대기 항목 전부를 되돌린다(마이그레이터가 한 tx 로 적용). 이것을 덮는 코드를 쓰지 않는다.
async function applyModules(
	db: Db,
	modules: ReadonlyArray<MigrationModule>,
): Promise<Result<void, PermanentError>> {
	for (const { name, folder } of modules) {
		try {
			await migrate(db, {
				migrationsFolder: folder,
				migrationsSchema: MIGRATIONS_SCHEMA,
				migrationsTable: name,
			});
		} catch (error) {
			// 첫 실패에서 멈춘다 — 뒤 모듈과 권한은 적용하지 않는다.
			return moduleError(name, "마이그레이션 적용에 실패했다", error);
		}
	}
	return Result.ok(undefined);
}

// 접속 역할(소유자)을 관리 역할에 넣으면 소유자 권한을 스스로 회수해 다음 마이그레이션이 막힌다 — 적용 전에 거절한다.
async function applyGrants(
	db: Db,
	spec: RolesSpec,
): Promise<Result<void, PermanentError>> {
	try {
		return await db.transaction(async (tx) => {
			const rows = await tx.execute(currentUserQuery());
			const owner: unknown = rows[0]?.name;
			if (typeof owner === "string" && spec.roles.includes(owner)) {
				return Result.err(
					new PermanentError({
						message: "접속 역할이 관리 역할에 들어 있어 권한을 적용하지 않는다",
						details: { roles: owner },
					}),
				);
			}
			// 명세에서 스키마가 통째로 빠져도 그 스키마의 낡은 권한을 회수하려고 소유 스키마를 같은 tx 에서 읽는다.
			const ownedSchemas: string[] = [];
			for (const row of await tx.execute(ownedSchemasQuery())) {
				const name: unknown = row.name;
				if (typeof name === "string") {
					ownedSchemas.push(name);
				}
			}
			for (const statement of grantStatements(spec, ownedSchemas)) {
				await tx.execute(statement);
			}
			return Result.ok(undefined);
		});
	} catch (error) {
		return Result.err(
			new PermanentError({
				message: "권한 적용에 실패했다",
				details: { stage: "grants" },
				cause: error,
			}),
		);
	}
}

// 동시 실행 잠금은 예약한 한 연결에 걸고 같은 연결에서 푼다. 풀리지 않은 채 연결이 풀로 돌아가면 잠금이 남는다.
async function withMigrationLock<T>(
	client: Bun.SQL,
	work: () => Promise<T>,
): Promise<T> {
	const connection = await client.reserve();
	try {
		await acquireMigrationLock(connection);
		try {
			return await work();
		} finally {
			await releaseMigrationLock(connection);
		}
	} finally {
		await connection.release();
	}
}

export async function runMigrations(
	pool: DbPool,
	plan: {
		readonly modules: ReadonlyArray<MigrationModule>;
		readonly roles: unknown;
	},
): Promise<Result<void, PermanentError>> {
	const validModules = validateModules(plan.modules);
	if (!validModules.ok) {
		return validModules;
	}
	const spec = parseRolesSpec(plan.roles);
	if (!spec.ok) {
		return spec;
	}
	const handle = handleOf(pool);
	if (!handle.ok) {
		return handle;
	}
	const poolSize = validatePoolSize(handle.value.client);
	if (!poolSize.ok) {
		return poolSize;
	}

	try {
		return await withMigrationLock(handle.value.client, async () => {
			const applied = await applyModules(handle.value.db, plan.modules);
			if (!applied.ok) {
				return applied;
			}
			return applyGrants(handle.value.db, spec.value);
		});
	} catch (error) {
		// 잠금·연결 단계의 실패 — 모듈 이름이 없다.
		return Result.err(
			new PermanentError({
				message: "마이그레이션 실행기가 잠금·연결 단계에서 실패했다",
				details: { stage: "lock" },
				cause: error,
			}),
		);
	}
}
