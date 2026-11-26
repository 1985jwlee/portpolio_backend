// raw SQL 레지스트리(ADR-025) — 헬스 검사용 연결 확인.
// 탈출 사유: 읽기 핸들(ReadDb)에는 select 계열뿐이라 `SELECT 1` 을 Drizzle 빌더로 쓸 수 없다.
import { type PermanentError, Result, TransientError } from "@pf/kernel";
import { sql } from "drizzle-orm";
import { type DbPool, handleOf } from "../../../pool.ts";

/**
 * 풀에서 연결 하나를 꺼내 `SELECT 1` 이 `timeoutMs` 안에 돌아오는지 본다.
 * 시간이 지나면 TransientError 다 — 질의 자체는 취소되지 않고 풀이 닫힐 때 정리된다(Bun.SQL 에 질의 취소가 없다).
 * 가짜 풀(createDbPool 로 만들지 않은 것)은 PermanentError 다.
 */
export async function ping(
	pool: DbPool,
	timeoutMs: number,
): Promise<Result<void, TransientError | PermanentError>> {
	const handle = handleOf(pool);
	if (!handle.ok) {
		return handle;
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), timeoutMs);
	});
	try {
		const outcome = await Promise.race([
			handle.value.db.execute(sql`select 1`).then(() => "ok" as const),
			expired,
		]);
		return outcome === "ok"
			? Result.ok(undefined)
			: Result.err(
					new TransientError({
						message: `DB 응답이 ${timeoutMs}ms 안에 오지 않았다`,
					}),
				);
	} catch (error) {
		return Result.err(
			new TransientError({ message: "DB 연결 확인에 실패했다", cause: error }),
		);
	} finally {
		clearTimeout(timer);
	}
}
