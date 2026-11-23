// raw SQL 레지스트리(ADR-025) — 트랜잭션 시간 제한 3종을 거는 `set_config`.
// 탈출 사유: Drizzle 빌더에 SET 이 없고, `SET LOCAL` 은 바인드 매개변수를 못 받는다 → `set_config(이름, 값, true)` 로 대신한다.
// `true` 는 트랜잭션 로컬이라 커밋·롤백 뒤 같은 세션의 값은 원래대로 돌아온다.
import { type SQL, sql } from "drizzle-orm";

// 값은 F16 §8.2 그대로다 — 새 수치를 만들지 않는다.
export const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
// Postgres 의 정수 GUC(statement_timeout) 상한이다 — 넘으면 set_config 가 DB 에서 실패한다.
export const MAX_STATEMENT_TIMEOUT_MS = 2_147_483_647;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 2_000;

/** 세 설정을 한 문장으로 거는 SQL 조각. 값은 바인드 매개변수라 문자열 보간이 없다. */
export function txSettings(statementTimeoutMs: number): SQL {
	return sql`select set_config('statement_timeout', ${String(statementTimeoutMs)}, true), set_config('idle_in_transaction_session_timeout', ${String(IDLE_IN_TRANSACTION_TIMEOUT_MS)}, true), set_config('lock_timeout', ${String(LOCK_TIMEOUT_MS)}, true)`;
}
