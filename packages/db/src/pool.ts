// 연결 풀과 읽기 전용 핸들. 쓰기·트랜잭션은 이 파일의 책임이 아니다(unit-of-work.ts).
// 풀 객체가 밖으로 내주는 것은 `read` 와 `close` 뿐이고, 실제 클라이언트·전체 Drizzle DB 는 패키지 안에서만 꺼낸다.
import { PermanentError, Result } from "@pf/kernel";
import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";

/** select 계열만 가진 읽기 핸들 — usecase 가 UnitOfWork 밖에서 읽을 때 쓴다. */
export type ReadDb = Pick<
	BunSQLDatabase<Record<string, never>>,
	"select" | "selectDistinct" | "selectDistinctOn" | "$count"
>;

/**
 * 풀이 밖에 내주는 통계 — Bun.SQL 이 실제로 주는 값만 담는다(TD-8 8-3).
 * 사용 중·대기 연결 수 같은 실시간 값은 Bun.SQL 이 노출하지 않아 만들지 않는다.
 * `closed` 는 풀의 내부 상태가 아니라 이 래퍼에서 close 를 불렀는지다.
 */
export type PoolStats = {
	readonly max: number | undefined;
	readonly closed: boolean;
};

export type DbPool = {
	readonly read: ReadDb;
	stats(): PoolStats;
	/** 기한 안에 진행 중인 질의를 기다려 닫는다. 기한이 지나면 남은 질의는 연결 종료 오류로 거절된다. */
	close(deadlineMs: number): Promise<void>;
};

/** 패키지 안에서만 쓰는 손잡이 — 쓰기 가능한 Drizzle DB 와 그 아래 Bun.SQL 클라이언트. */
export type PoolHandle = {
	readonly client: Bun.SQL;
	readonly db: BunSQLDatabase<Record<string, never>>;
};

// 풀 객체 → 손잡이. 공개 타입에 손잡이를 싣지 않으려는 장치이고, 등록된 풀만 UoW·실행기에 들어올 수 있다.
const handles = new WeakMap<DbPool, PoolHandle>();

// 원본 DB 를 그대로 `read` 에 넣지 않는다 — 쓰기 메서드가 런타임에 살아난다.
// with·$with·execute·transaction 도 뺐다: with(...) 는 insert·update·delete 를 함께 돌려준다.
function readOnly(db: BunSQLDatabase<Record<string, never>>): ReadDb {
	return Object.freeze({
		select: db.select.bind(db),
		selectDistinct: db.selectDistinct.bind(db),
		selectDistinctOn: db.selectDistinctOn.bind(db),
		$count: db.$count.bind(db),
	});
}

export function createDbPool(options: { readonly url: string }): DbPool {
	// Bun.SQL 은 첫 쿼리 전에는 연결하지 않는다 — 풀을 만드는 것만으로는 I/O 가 없다.
	const client = new Bun.SQL(options.url);
	const db = drizzle(client);
	let closed = false;
	const pool: DbPool = Object.freeze({
		read: readOnly(db),
		stats: () => Object.freeze({ max: client.options.max, closed }),
		close: (deadlineMs: number) => {
			closed = true;
			// Bun.SQL 의 timeout 단위는 초다. 0 이면 기다리지 않고 바로 닫는다.
			return client.close({ timeout: Math.max(0, deadlineMs) / 1000 });
		},
	});
	handles.set(pool, { client, db });
	return pool;
}

/** createDbPool 로 만든 풀에서 손잡이를 꺼낸다. 다른 출처의 객체(가짜 풀)면 Err 다. */
export function handleOf(pool: DbPool): Result<PoolHandle, PermanentError> {
	const handle = handles.get(pool);
	if (handle === undefined) {
		return Result.err(
			new PermanentError({ message: "createDbPool 로 만든 풀이 아니다" }),
		);
	}
	return Result.ok(handle);
}
