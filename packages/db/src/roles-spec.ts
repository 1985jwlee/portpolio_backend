// 권한 명세(roles.json)의 해석 — unknown 입력을 검증된 명세로 바꾼다. 적용(GRANT/REVOKE)은 이 파일의 책임이 아니다.
// 검증 실패는 Err 이고 details.roles 에 어긋난 키(경로)를 싣는다. 역할 생성·시퀀스·함수 권한은 다루지 않고, 목록에서 뺀 역할의 기존 권한도 회수하지 않는다(TD-8).
import { PermanentError, Result } from "@pf/kernel";

const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
export type Privilege = (typeof PRIVILEGES)[number];

export type RoleGrant = {
	readonly role: string;
	readonly privileges: ReadonlyArray<Privilege>;
};

export type TableGrants = {
	readonly schema: string;
	readonly table: string;
	readonly grants: ReadonlyArray<RoleGrant>;
};

export type RolesSpec = {
	readonly roles: ReadonlyArray<string>;
	readonly tables: ReadonlyArray<TableGrants>;
};

// SQL 식별자로 그대로 인용되는 값이라 형식을 좁게 잡는다. 명세 문자열을 SQL 에 이어 붙이지 않는다.
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
	return typeof value === "string" && IDENTIFIER.test(value);
}

function isPrivilege(value: unknown): value is Privilege {
	return PRIVILEGES.some((privilege) => privilege === value);
}

function reject(key: string, message: string): Result<never, PermanentError> {
	return Result.err(
		new PermanentError({
			message: `roles 명세가 올바르지 않다: ${message}`,
			details: { roles: key },
		}),
	);
}

function parseRoleNames(
	value: unknown,
): Result<ReadonlyArray<string>, PermanentError> {
	if (!Array.isArray(value)) {
		return reject("roles", "roles 는 배열이어야 한다");
	}
	const names: string[] = [];
	for (const item of value) {
		// public 은 PUBLIC 의사 역할과 혼동되므로 관리 역할로 받지 않는다.
		if (!isIdentifier(item) || item === "public") {
			return reject(
				"roles",
				"roles 의 항목은 식별자여야 하고 public 일 수 없다",
			);
		}
		if (names.includes(item)) {
			return reject("roles", `roles 에 ${item} 가 중복이다`);
		}
		names.push(item);
	}
	return Result.ok(names);
}

function parsePrivileges(
	value: unknown,
	key: string,
): Result<ReadonlyArray<Privilege>, PermanentError> {
	if (!Array.isArray(value) || value.length === 0) {
		return reject(key, "권한은 비지 않은 배열이어야 한다");
	}
	const privileges: Privilege[] = [];
	for (const item of value) {
		if (!isPrivilege(item)) {
			return reject(key, "허용되지 않은 권한이다");
		}
		if (privileges.includes(item)) {
			return reject(key, `권한 ${item} 가 중복이다`);
		}
		privileges.push(item);
	}
	return Result.ok(privileges);
}

function parseTable(
	key: string,
	value: unknown,
	roles: ReadonlyArray<string>,
): Result<TableGrants, PermanentError> {
	const parts = key.split(".");
	const [schema, table] = parts;
	if (parts.length !== 2 || !isIdentifier(schema) || !isIdentifier(table)) {
		return reject(`tables.${key}`, "표 키는 <스키마>.<표> 두 식별자여야 한다");
	}
	if (!isRecord(value)) {
		return reject(`tables.${key}`, "표의 값은 { 역할: 권한[] } 객체여야 한다");
	}
	const grants: RoleGrant[] = [];
	for (const [role, rawPrivileges] of Object.entries(value)) {
		const path = `tables.${key}.${role}`;
		if (!roles.includes(role)) {
			return reject(path, "roles 에 없는 역할이다");
		}
		const privileges = parsePrivileges(rawPrivileges, path);
		if (!privileges.ok) {
			return privileges;
		}
		grants.push({ role, privileges: privileges.value });
	}
	return Result.ok({ schema, table, grants });
}

export function parseRolesSpec(
	input: unknown,
): Result<RolesSpec, PermanentError> {
	if (!isRecord(input)) {
		return reject("(root)", "최상위는 객체여야 한다");
	}
	for (const key of Object.keys(input)) {
		if (key !== "roles" && key !== "tables") {
			return reject(key, "알 수 없는 최상위 키다");
		}
	}
	if (!("roles" in input)) {
		return reject("roles", "roles 키가 없다");
	}
	if (!("tables" in input)) {
		return reject("tables", "tables 키가 없다");
	}
	const roles = parseRoleNames(input.roles);
	if (!roles.ok) {
		return roles;
	}
	const rawTables = input.tables;
	if (!isRecord(rawTables)) {
		return reject("tables", "tables 는 객체여야 한다");
	}
	const tables: TableGrants[] = [];
	for (const [key, value] of Object.entries(rawTables)) {
		const table = parseTable(key, value, roles.value);
		if (!table.ok) {
			return table;
		}
		tables.push(table.value);
	}
	return Result.ok({ roles: roles.value, tables });
}
