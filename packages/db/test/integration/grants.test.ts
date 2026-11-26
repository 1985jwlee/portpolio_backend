// 권한 적용(L3) — roles 명세를 GRANT/REVOKE 로 적용한 결과를 역할별로 시도해 본다(10-security §5.1 권한 행렬).
// 각 확인은 슈퍼유저 세션의 tx 안에서 `SET LOCAL ROLE` 한 뒤 시도하고 롤백한다 — 역할로 접속하지 않으므로 로그인 권한이 필요 없다.
// 명세는 시험 안 객체다(KB #29) — 저장소 roles.json 을 복사하지 않는다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createDbPool, type MigrationModule, runMigrations } from "@pf/db";
import {
	catalogSnapshot,
	ensureFixtureRoles,
	FIXTURE_MODULES,
	freshDatabase,
	queryRows,
} from "./support.ts";

const TIMEOUT_MS = 30_000;
const ALL_WRITES = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const ROLES = ["pf_api_rw", "pf_worker_rw", "pf_gateway_ro"];

const modules: MigrationModule[] = ["alpha", "beta"].map((name) => ({
	name,
	folder: join(FIXTURE_MODULES, name, "migrations"),
}));

const fullSpec = {
	roles: ROLES,
	tables: {
		"alpha.item": { pf_api_rw: ALL_WRITES, pf_gateway_ro: ["SELECT"] },
		"beta.thing": { pf_worker_rw: ALL_WRITES, pf_api_rw: ["SELECT"] },
	},
};

let database: Awaited<ReturnType<typeof freshDatabase>>;

beforeAll(async () => {
	await ensureFixtureRoles();
	database = await freshDatabase();
}, TIMEOUT_MS);

afterAll(async () => {
	await database.drop();
});

async function apply(roles: unknown) {
	const pool = createDbPool({ url: database.url });
	try {
		return await runMigrations(pool, { modules, roles });
	} finally {
		await pool.close(5_000);
	}
}

// 역할로 문장을 시도하고 SQLSTATE 를 돌려준다(성공이면 undefined). 항상 롤백한다.
async function attempt(
	role: string,
	statement: string,
): Promise<string | undefined> {
	const client = new Bun.SQL(database.url);
	const connection = await client.reserve();
	try {
		await connection.unsafe("begin");
		await connection.unsafe(`set local role "${role}"`);
		try {
			await connection.unsafe(statement);
			return undefined;
		} catch (error) {
			const errno = error instanceof Error ? Reflect.get(error, "errno") : "";
			return typeof errno === "string" ? errno : String(errno);
		}
	} finally {
		await connection.unsafe("rollback");
		await connection.release();
		await client.close();
	}
}

// 적용 결과의 스냅샷 — 표 권한 + 스키마 권한. 두 번 적용해 같은지 비교하는 데 쓴다.
async function privilegeSnapshot(): Promise<string> {
	const tables = await queryRows(
		database.url,
		"select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema in ('alpha', 'beta') order by 1, 2, 3, 4",
	);
	const schemas = await queryRows(
		database.url,
		"select nspname, nspacl::text as acl from pg_namespace where nspname in ('alpha', 'beta') order by 1",
	);
	return JSON.stringify([tables, schemas]);
}

describe("권한 적용 — 행렬", () => {
	beforeAll(async () => {
		// 시험 준비: 먼저 표만 만들고(권한 없음), 명세에 없는 표에 낡은 권한을 심은 뒤 명세를 적용한다.
		const prepared = await apply({ roles: ROLES, tables: {} });
		expect(prepared.ok).toBe(true);
		await queryRows(database.url, "create table alpha.extra (id int)");
		await queryRows(
			database.url,
			"grant usage on schema alpha to public, pf_api_rw",
		);
		await queryRows(
			database.url,
			"grant select on alpha.extra to public, pf_api_rw",
		);
	}, TIMEOUT_MS);

	test(
		"대조군 — 명세를 적용하기 전에는 낡은 권한 때문에 api_rw 가 명세에 없는 표를 읽는다(회수가 실제로 일을 한다는 증명)",
		async () => {
			expect(await attempt("pf_api_rw", "select 1 from alpha.extra")).toBe(
				undefined,
			);
		},
		TIMEOUT_MS,
	);

	test(
		"명세 적용 → 허용된 것은 되고(양성 대조) 나머지는 42501 이다",
		async () => {
			const result = await apply(fullSpec);
			expect(result.ok).toBe(true);

			// 양성 대조 — 부여가 실제로 일을 했다.
			expect(await attempt("pf_gateway_ro", "select 1 from alpha.item")).toBe(
				undefined,
			);
			expect(
				await attempt(
					"pf_api_rw",
					"insert into alpha.item (id, entry_id, actor_id) values (1, 1, 'a')",
				),
			).toBeUndefined();
			expect(
				await attempt(
					"pf_worker_rw",
					"insert into beta.thing (id, entry_id, actor_id) values (1, 1, 'a')",
				),
			).toBeUndefined();
			expect(await attempt("pf_api_rw", "select 1 from beta.thing")).toBe(
				undefined,
			);

			// 거부 — 명세에 없는 권한.
			expect(
				await attempt(
					"pf_gateway_ro",
					"insert into alpha.item (id, entry_id, actor_id) values (2, 2, 'a')",
				),
			).toBe("42501");
			expect(
				await attempt(
					"pf_api_rw",
					"insert into beta.thing (id, entry_id, actor_id) values (2, 2, 'a')",
				),
			).toBe("42501");
			expect(await attempt("pf_gateway_ro", "select 1 from beta.thing")).toBe(
				"42501",
			);
			// 회수 — 명세에 없는 표의 낡은 권한이 PUBLIC·관리 역할 모두에서 사라졌다.
			expect(await attempt("pf_api_rw", "select 1 from alpha.extra")).toBe(
				"42501",
			);
		},
		TIMEOUT_MS,
	);

	test(
		"특성 확인 — 관리 역할은 소유자가 아니라 DDL 이 거부된다(소유권 때문이라 회귀 가드가 아니다)",
		async () => {
			expect(
				await attempt("pf_api_rw", "alter table alpha.item add column x int"),
			).toBe("42501");
			expect(
				await attempt("pf_worker_rw", "create table beta.x (id int)"),
			).toBe("42501");
		},
		TIMEOUT_MS,
	);

	test(
		"같은 명세를 두 번 적용해도 권한 스냅샷이 같다(멱등)",
		async () => {
			const before = await privilegeSnapshot();
			const result = await apply(fullSpec);
			expect(result.ok).toBe(true);
			expect(await privilegeSnapshot()).toBe(before);
		},
		TIMEOUT_MS,
	);

	test(
		"명세에서 권한을 빼고 다시 적용하면 그 권한이 회수된다",
		async () => {
			const withoutGateway = {
				roles: ROLES,
				tables: {
					"alpha.item": { pf_api_rw: ALL_WRITES },
					"beta.thing": { pf_worker_rw: ALL_WRITES, pf_api_rw: ["SELECT"] },
				},
			};
			const result = await apply(withoutGateway);
			expect(result.ok).toBe(true);
			expect(await attempt("pf_gateway_ro", "select 1 from alpha.item")).toBe(
				"42501",
			);
			// 빼지 않은 권한은 그대로다.
			expect(await attempt("pf_api_rw", "select 1 from alpha.item")).toBe(
				undefined,
			);
		},
		TIMEOUT_MS,
	);

	test(
		"접속 역할을 관리 역할에 넣은 명세는 Err 이고 권한은 바뀌지 않는다",
		async () => {
			const owner = await queryRows(
				database.url,
				"select current_user as name",
			);
			const name = String(owner[0]?.name);
			const before = await privilegeSnapshot();
			const result = await apply({
				roles: [...ROLES, name],
				tables: { "alpha.item": { [name]: ["SELECT"] } },
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.details).toEqual({ roles: name });
			}
			expect(await privilegeSnapshot()).toBe(before);
			// 소유자 권한은 그대로라 같은 연결로 계속 읽을 수 있다.
			expect(await catalogSnapshot(database.url, ["alpha"])).not.toBe("");
		},
		TIMEOUT_MS,
	);
});

// M-1 — 명세에서 스키마의 표를 전부 빼면 그 스키마의 낡은 권한도 회수돼야 한다(접속 역할 소유 스키마 ∪ 명세 스키마).
describe("권한 적용 — 스키마를 통째로 뺀 명세", () => {
	const betaOnly = {
		roles: ROLES,
		tables: { "beta.thing": { pf_worker_rw: ALL_WRITES } },
	};

	async function canUse(role: string, schema: string): Promise<boolean> {
		const rows = await queryRows(
			database.url,
			`select has_schema_privilege('${role}', '${schema}', 'USAGE') as ok`,
		);
		return rows[0]?.ok === true;
	}

	async function canSelect(role: string, table: string): Promise<boolean> {
		const rows = await queryRows(
			database.url,
			`select has_table_privilege('${role}', '${table}', 'SELECT') as ok`,
		);
		return rows[0]?.ok === true;
	}

	test(
		"alpha 의 표를 명세에서 전부 빼면 alpha 의 USAGE·표 권한이 PUBLIC·관리 역할 모두에서 회수되고 beta 는 그대로다",
		async () => {
			// 준비: alpha 에 관리 역할 권한과 PUBLIC 권한이 실제로 있는 상태를 만든다(대조군).
			const first = await apply(fullSpec);
			expect(first.ok).toBe(true);
			await queryRows(database.url, "grant usage on schema alpha to public");
			await queryRows(database.url, "grant select on alpha.item to public");
			expect(await canUse("pf_api_rw", "alpha")).toBe(true);
			expect(await canSelect("pf_api_rw", "alpha.item")).toBe(true);
			expect(await canSelect("pf_gateway_ro", "alpha.item")).toBe(true);

			// 실행: alpha 가 명세에서 통째로 빠진 명세를 다시 적용한다.
			const second = await apply(betaOnly);
			expect(second.ok).toBe(true);

			for (const role of ROLES) {
				expect(await canUse(role, "alpha")).toBe(false);
				expect(await canSelect(role, "alpha.item")).toBe(false);
			}
			// 명세에 남은 beta 의 부여는 그대로다.
			expect(await canUse("pf_worker_rw", "beta")).toBe(true);
			expect(await canSelect("pf_worker_rw", "beta.thing")).toBe(true);
			expect(await canSelect("pf_api_rw", "beta.thing")).toBe(false);
		},
		TIMEOUT_MS,
	);

	test(
		"명세가 표를 하나도 안 가져도(roles 만) 소유 스키마의 권한이 전부 회수된다",
		async () => {
			const result = await apply({ roles: ROLES, tables: {} });
			expect(result.ok).toBe(true);
			expect(await canUse("pf_worker_rw", "beta")).toBe(false);
			expect(await canSelect("pf_worker_rw", "beta.thing")).toBe(false);
		},
		TIMEOUT_MS,
	);
});

// 확장이 관리하는 스키마는 명세 밖이어도 자동 회수에서 빠진다 — 소유자가 확장을 설치해도 확장의 PUBLIC 권한이 깨지지 않게.
// 확장 스크립트가 만드는 스키마(TimescaleDB 등)는 `alter extension … add schema` 로 같은 카탈로그 상태(pg_depend `e`)를 만든다.
describe("권한 적용 — 확장이 관리하는 스키마", () => {
	async function canUse(schema: string): Promise<boolean> {
		const rows = await queryRows(
			database.url,
			`select has_schema_privilege('pf_api_rw', '${schema}', 'USAGE') as ok`,
		);
		return rows[0]?.ok === true;
	}

	test(
		"확장 소속 스키마·확장이 설치된 스키마의 PUBLIC USAGE 는 남고 일반 소유 스키마는 회수된다",
		async () => {
			await queryRows(database.url, "create extension citext");
			await queryRows(database.url, "create schema ext_member");
			await queryRows(
				database.url,
				"alter extension citext add schema ext_member",
			);
			await queryRows(database.url, "create schema ext_host");
			await queryRows(database.url, "create extension pg_trgm schema ext_host");
			await queryRows(database.url, "create schema plain_owned");
			for (const schema of ["ext_member", "ext_host", "plain_owned"]) {
				await queryRows(
					database.url,
					`grant usage on schema ${schema} to public`,
				);
				// 대조군 — 적용 전에는 셋 다 열려 있다.
				expect(await canUse(schema)).toBe(true);
			}

			const result = await apply({ roles: ROLES, tables: {} });
			expect(result.ok).toBe(true);

			expect(await canUse("ext_member")).toBe(true);
			expect(await canUse("ext_host")).toBe(true);
			expect(await canUse("plain_owned")).toBe(false);
		},
		TIMEOUT_MS,
	);
});
