// raw SQL 레지스트리(ADR-025) — 권한 명세를 GRANT/REVOKE 문장 목록으로 바꾼다. DCL 은 Drizzle 빌더에 없다.
// 식별자는 전부 sql.identifier 로 인용하고, 권한어는 화이트리스트(Privilege)뿐이라 명세 문자열이 SQL 에 이어 붙지 않는다.
import { type SQL, sql } from "drizzle-orm";
import type { Privilege, RolesSpec, TableGrants } from "../../../roles-spec.ts";

/** 적용 직전에 접속 역할(= 소유자)을 확인하는 질의. 결과 행의 `name` 열을 읽는다. */
export function currentUserQuery(): SQL {
	return sql`select current_user as name`;
}

/**
 * 접속 역할(= 마이그레이션 소유자)이 소유한 사용자 스키마 이름 질의. 결과 행의 `name` 열을 읽는다.
 * 명세에서 표가 전부 빠진 스키마도 회수 대상에 넣으려고 쓴다 — 명세만 보면 그 스키마를 더는 알 수 없다.
 * 시스템 스키마(`pg_*`·`information_schema`)는 뺀다. 접속 역할이 소유하지 않은 스키마(`public` 등)는 명세에 있을 때만 다룬다.
 * 확장이 관리하는 스키마도 뺀다 — 확장 스크립트가 만든 스키마(`pg_depend` 의 `e` 의존, 예: TimescaleDB 의 내부 스키마)와
 * 확장이 설치된 스키마(`pg_extension.extnamespace`)다. 고정 이름 목록은 확장·버전마다 스키마가 달라 쓰지 않고 카탈로그로 가른다.
 * 이 제외는 "명세에 없는 스키마를 자동으로 회수하는" 경로에만 걸린다 — 명세에 적힌 스키마는 확장 스키마여도 회수 대상이다(명시한 것이므로).
 */
export function ownedSchemasQuery(): SQL {
	return sql`select n.nspname as name from pg_namespace n where n.nspowner = (select r.oid from pg_roles r where r.rolname = current_user) and n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and not exists (select 1 from pg_depend d where d.classid = 'pg_namespace'::regclass and d.objid = n.oid and d.deptype = 'e') and not exists (select 1 from pg_extension x where x.extnamespace = n.oid) order by n.nspname`;
}

// PUBLIC 과 관리 역할 전부 — 회수 대상이다.
function revokeTargets(roles: ReadonlyArray<string>): SQL {
	return sql.join(
		[sql.raw("PUBLIC"), ...roles.map((role) => sql.identifier(role))],
		sql`, `,
	);
}

function privilegeList(privileges: ReadonlyArray<Privilege>): SQL {
	return sql.join(
		privileges.map((privilege) => sql.raw(privilege)),
		sql`, `,
	);
}

function groupBySchema(
	tables: ReadonlyArray<TableGrants>,
): Map<string, TableGrants[]> {
	const bySchema = new Map<string, TableGrants[]>();
	for (const table of tables) {
		const group = bySchema.get(table.schema);
		if (group === undefined) {
			bySchema.set(table.schema, [table]);
		} else {
			group.push(table);
		}
	}
	return bySchema;
}

function schemaStatements(
	schema: string,
	tables: ReadonlyArray<TableGrants>,
	roles: ReadonlyArray<string>,
): SQL[] {
	const schemaName = sql.identifier(schema);
	const targets = revokeTargets(roles);
	const statements: SQL[] = [
		// ① 스키마 권한 회수 ② 그 스키마 모든 표 권한 회수 — 회수가 먼저라 두 번 적용해도 같고, 명세에서 뺀 권한은 사라진다.
		sql`revoke all on schema ${schemaName} from ${targets}`,
		sql`revoke all on all tables in schema ${schemaName} from ${targets}`,
	];
	// ③ 그 스키마에 권한이 하나라도 있는 역할에만 USAGE.
	const usageRoles = roles.filter((role) =>
		tables.some((table) => table.grants.some((grant) => grant.role === role)),
	);
	for (const role of usageRoles) {
		statements.push(
			sql`grant usage on schema ${schemaName} to ${sql.identifier(role)}`,
		);
	}
	// ④ 표마다 역할별 명시 권한 부여.
	for (const table of tables) {
		for (const grant of table.grants) {
			statements.push(
				sql`grant ${privilegeList(grant.privileges)} on table ${schemaName}.${sql.identifier(table.table)} to ${sql.identifier(grant.role)}`,
			);
		}
	}
	return statements;
}

/**
 * 순서가 의미를 갖는 문장 목록 — 스키마(이름순)마다 회수 → 회수 → USAGE → 표별 부여.
 * 대상 스키마는 `ownedSchemas`(접속 역할 소유) ∪ 명세 스키마다. 명세에 표가 없는 스키마는 회수 두 문장만 나간다.
 */
export function grantStatements(
	spec: RolesSpec,
	ownedSchemas: ReadonlyArray<string>,
): ReadonlyArray<SQL> {
	const bySchema = groupBySchema(spec.tables);
	return [...new Set([...ownedSchemas, ...bySchema.keys()])]
		.sort()
		.flatMap((schema) =>
			schemaStatements(schema, bySchema.get(schema) ?? [], spec.roles),
		);
}
