// 트랜잭션 경계의 단일 구현 — 열기·시간 제한·now 고정·커밋/롤백·오류 사상·중첩 판정.
// 재시도·지표·로그는 이 파일의 책임이 아니다(TD-8).
import { AsyncLocalStorage } from "node:async_hooks";
import {
	type AppError,
	type Clock,
	type Err,
	type Instant,
	PermanentError,
	Result,
} from "@pf/kernel";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import {
	DEFAULT_STATEMENT_TIMEOUT_MS,
	MAX_STATEMENT_TIMEOUT_MS,
	txSettings,
} from "./adapter/postgres/raw/tx-settings.ts";
import { type DbPool, handleOf } from "./pool.ts";

// Drizzle 트랜잭션에서 rollback·setTransaction 을 뺀 타입이다. 롤백은 Err 를 돌려주는 것으로만 한다 —
// tx.rollback() 은 예외를 던져 PermanentError 로 잘못 분류된다. 하위 작업은 db.transaction()(savepoint)으로 한다.
type DrizzleTx = Parameters<
	Parameters<BunSQLDatabase<Record<string, never>>["transaction"]>[0]
>[0];
type TxDb = Omit<DrizzleTx, "rollback" | "setTransaction">;

export type TxOptions = { readonly timeoutMs?: number };

export type TxContext = { readonly db: TxDb; readonly now: Instant };

export interface UnitOfWork {
	run<T, E extends AppError>(
		fn: (tx: TxContext) => Promise<Result<T, E>>,
		opts?: TxOptions,
	): Promise<Result<T, E | PermanentError>>;
}

// 중첩 판정용 표지. 저장소는 인스턴스가 아니라 모듈 하나다 — 다른 UoW 인스턴스로 감싸도 중첩이다.
// 전역 불리언이 아니라 비동기 맥락을 따라가야 `Promise.all` 로 동시에 도는 두 run 이 중첩으로 오인되지 않는다.
const activeTx = new AsyncLocalStorage<true>();

// fn 이 Err 를 돌려줬을 때 트랜잭션을 롤백시키려고 던지는 내부 표지. 실제 Err 는 호출 쪽 지역 변수가 들고 있다.
class RollbackSignal extends Error {}

export class PostgresUnitOfWork implements UnitOfWork {
	readonly #pool: DbPool;
	readonly #clock: Clock;

	constructor(pool: DbPool, clock: Clock) {
		this.#pool = pool;
		this.#clock = clock;
	}

	async run<T, E extends AppError>(
		fn: (tx: TxContext) => Promise<Result<T, E>>,
		opts?: TxOptions,
	): Promise<Result<T, E | PermanentError>> {
		const timeoutMs = opts?.timeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
		if (
			!Number.isSafeInteger(timeoutMs) ||
			timeoutMs <= 0 ||
			timeoutMs > MAX_STATEMENT_TIMEOUT_MS
		) {
			return Result.err(
				new PermanentError({
					message: "timeoutMs 는 1 이상 2147483647 이하의 정수여야 한다",
					details: { timeoutMs },
				}),
			);
		}
		if (activeTx.getStore() !== undefined) {
			return Result.err(
				new PermanentError({
					message: "UnitOfWork.run 안에서 run 을 다시 열 수 없다(중첩 금지)",
				}),
			);
		}
		const handle = handleOf(this.#pool);
		if (!handle.ok) {
			return handle;
		}

		const rolledBack: { failure?: Err<E> } = {};
		try {
			return await handle.value.db.transaction(async (tx) => {
				await tx.execute(txSettings(timeoutMs));
				const now = this.#clock.now();
				const outcome = await activeTx.run(true, () => fn({ db: tx, now }));
				if (!outcome.ok) {
					rolledBack.failure = outcome;
					throw new RollbackSignal();
				}
				return outcome;
			});
		} catch (error) {
			if (error instanceof RollbackSignal && rolledBack.failure !== undefined) {
				return rolledBack.failure;
			}
			return Result.err(
				new PermanentError({
					message: "트랜잭션 중 예기치 않은 오류가 났다",
					cause: error,
				}),
			);
		}
	}
}
