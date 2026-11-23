// raw SQL 레지스트리(ADR-025) — 마이그레이션 동시 실행을 막는 세션 단위 advisory 잠금(T2: 트랜잭션 밖 별도 연결).
// ADR-025 레지스트리의 "리더 선출" 행과 같은 성격이다. 잠금은 호출 쪽이 예약한 한 연결에 걸리고, 같은 연결에서 풀어야 한다.
// 키는 문자열 해시로 SQL 에서 만든다 — 코드에 마법 수를 두지 않는다.

const LOCK_NAME = "pf-migrate";

/** 잠금을 얻을 때까지 기다린다. 대기 시간에 상한을 두지 않는다(TD-8). */
export async function acquireMigrationLock(
	connection: Bun.ReservedSQL,
): Promise<void> {
	await connection`select pg_advisory_lock(hashtext(${LOCK_NAME}))`;
}

export async function releaseMigrationLock(
	connection: Bun.ReservedSQL,
): Promise<void> {
	await connection`select pg_advisory_unlock(hashtext(${LOCK_NAME}))`;
}
