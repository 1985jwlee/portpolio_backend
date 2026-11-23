// 연결 풀과 읽기 전용 핸들. 쓰기·트랜잭션은 이 파일의 책임이 아니다(unit-of-work.ts).
// 풀 객체가 밖으로 내주는 것은 `read` 와 `close` 뿐이고, 실제 클라이언트·전체 Drizzle DB 는 패키지 안에서만 꺼낸다.
import { PermanentError, Result } from "@pf/kernel";
import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";

/** select 계열만 가진 읽기 핸들 — usecase 가 UnitOfWork 밖에서 읽을 때 쓴다. */
export type ReadDb = Pick<
	BunSQLDatabase<Record<string, never>>,
	"select" | "selectDistinct" | "selectDistinctOn" | "$count"
>;

export type DbPool = {
	readonly read: ReadDb;
	close(): Promise<void>;
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
	const pool: DbPool = Object.freeze({
		read: readOnly(db),
		close: () => client.close(),
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
