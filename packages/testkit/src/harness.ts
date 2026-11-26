import type { MigrationModule } from "@pf/db";
import { createDbPool, runMigrations } from "@pf/db";
import { PermanentError } from "@pf/kernel";
import { FakeClock } from "./fake-clock.ts";
import { FakeIdGenerator } from "./fake-id-generator.ts";
import { FaultInjector } from "./fault-injector.ts";
import { TestDb } from "./test-db.ts";

/** 시험 환경 한 벌 — 시계·식별자·장애 주입기는 모든 하니스가 가진다. */
export abstract class TestHarness {
	readonly clock = new FakeClock();
	readonly ids = new FakeIdGenerator();
	readonly faults = new FaultInjector();

	abstract setup(): Promise<void>;
	abstract teardown(): Promise<void>;
}

/** DB 없이 순수 로직과 가짜 포트만 쓰는 시험(L2). */
export class UnitHarness extends TestHarness {
	setup(): Promise<void> {
		return Promise.resolve();
	}

	teardown(): Promise<void> {
		this.faults.clear();
		return Promise.resolve();
	}
}

/** 실제 Postgres 를 쓰는 시험의 공통 뼈대(L3). */
export abstract class DbHarness extends TestHarness {
	readonly db: TestDb;

	constructor(adminUrl: string) {
		super();
		this.db = new TestDb(adminUrl);
	}

	async setup(): Promise<void> {
		await this.db.start();
	}

	async teardown(): Promise<void> {
		this.faults.clear();
		await this.db.stop();
	}

	/** 시험 DB 에 모듈 마이그레이션과 권한을 적용한다. */
	async migrate(plan: {
		readonly modules: ReadonlyArray<MigrationModule>;
		readonly roles: unknown;
	}): Promise<void> {
		const pool = createDbPool({ url: this.db.url() });
		try {
			const result = await runMigrations(pool, plan);
			if (!result.ok) {
				throw result.error;
			}
		} finally {
			await pool.close(5_000);
		}
	}
}

/** 실제 Postgres + 실제 어댑터로 usecase 를 직접 호출하는 시험. */
export class ModuleHarness extends DbHarness {}

export type WorkerHandle = {
	readonly name: string;
	readonly step: () => Promise<void>;
	alive: boolean;
};

/** 여러 워커를 한 단계씩 진행한다. 워커 실체가 아직 없어 단계 함수를 등록하는 방식이다. */
export class WorkerHarness {
	#workers: WorkerHandle[] = [];

	spawn(name: string, step: () => Promise<void>): WorkerHandle {
		const handle: WorkerHandle = { name, step, alive: true };
		this.#workers.push(handle);
		return handle;
	}

	async runOnce(handle: WorkerHandle): Promise<void> {
		if (!handle.alive) {
			throw new PermanentError({
				message: "종료된 워커는 실행할 수 없다",
				details: { name: handle.name },
			});
		}
		await handle.step();
	}

	kill(handle: WorkerHandle): void {
		handle.alive = false;
	}

	killAll(): void {
		for (const handle of this.#workers) {
			handle.alive = false;
		}
		this.#workers = [];
	}
}

/** 여러 워커·결함 주입·가짜 시계를 함께 쓰는 동시성 시험. */
export class ChaosHarness extends DbHarness {
	readonly workers = new WorkerHarness();

	override async teardown(): Promise<void> {
		this.workers.killAll();
		await super.teardown();
	}
}
