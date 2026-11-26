// events 통합 시험 기반 — 접속 주소와 관리 역할. 시험 파일이 아니다(이름에 .test 없음).
// 계약: TEST_DATABASE_URL 은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터를 가리킨다.
// 없으면 건너뛰지 않고 실패한다 — 조용히 0건으로 끝나는 것이 가장 나쁜 실패다.

/** roles.json 의 관리 역할과 같은 이름이다. 클러스터 전역이라 만들기만 하고 지우지 않는다. */
export const MANAGED_ROLES = [
	"pf_api_rw",
	"pf_worker_rw",
	"pf_gateway_ro",
] as const;

export function adminUrl(): string {
	const url = process.env.TEST_DATABASE_URL;
	if (url === undefined || url === "") {
		throw new Error(
			"TEST_DATABASE_URL 이 없다 — 통합 시험은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터가 필요하다 (예: postgres://postgres:pw@127.0.0.1:5432/postgres)",
		);
	}
	return url;
}

/** 관리 역할을 없을 때만 만든다. 다른 시험 파일과의 생성 경합(42710)은 이미 있는 것으로 본다. */
export async function ensureManagedRoles(): Promise<void> {
	const admin = new Bun.SQL(adminUrl());
	try {
		for (const role of MANAGED_ROLES) {
			const found = await admin`select 1 from pg_roles where rolname = ${role}`;
			if (found.length > 0) {
				continue;
			}
			try {
				// 역할 이름은 위 상수뿐이라 인용만으로 충분하다(CREATE ROLE 은 바인드를 받지 못한다).
				await admin.unsafe(`create role "${role}" nologin`);
			} catch (error) {
				if (sqlState(error) !== "42710") {
					throw error;
				}
			}
		}
	} finally {
		await admin.close();
	}
}

/** Bun.SQL 오류의 SQLSTATE. 오류가 아니면 문자열로 바꿔 돌려준다. */
export function sqlState(error: unknown): string {
	const errno = error instanceof Error ? Reflect.get(error, "errno") : error;
	return typeof errno === "string" ? errno : String(errno);
}
