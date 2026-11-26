// db:seed — 시드 시나리오를 usecase 를 통해 넣는 프레임(02-dev-environment §4). 시나리오는 아직 0개다 — usecase 가 S2 이후에 생긴다.
// `APP_ENV=production` 이면 즉시 거절한다(운영 DB 보호). 시나리오는 DB 에 직접 INSERT 하지 않고 모듈이 index 로 내보낸 usecase 만 부른다(B4).
// 종료 코드: 0 성공(시나리오 0개 포함) · 1 production 거절 또는 시나리오 실패 · 78 설정 오류.
import {
	baseSchema,
	exitCodeFor,
	FileBackedEnvSource,
	loadConfig,
	ProcessEnvSource,
} from "@pf/config";
import { SystemClock, UuidV7Generator } from "@pf/infra";
import type { Clock, IdGenerator } from "@pf/kernel";

/** 시나리오가 받는 의존 — 공개 usecase 호출 수단(CommandBus)은 첫 usecase 가 생길 때 더한다. */
export type SeedContext = {
	readonly clock: Clock;
	readonly ids: IdGenerator;
};

export interface SeedScenario {
	readonly name: string;
	run(context: SeedContext): Promise<void>;
}

export type SeedOutcome = {
	/** 끝까지 돈 시나리오 이름(실행 순서). */
	readonly ran: readonly string[];
	/** 실패한 시나리오 — 있으면 그 뒤 시나리오는 돌지 않았다. */
	readonly failed?: { readonly name: string; readonly error: unknown };
};

export class SeedRunner {
	/** production 이면 거짓 — 호출자가 시나리오를 돌리지 않고 끝낸다. */
	guardEnvironment(appEnv: string): boolean {
		return appEnv !== "production";
	}

	/** 시나리오를 순서대로 돌리고 첫 실패에서 멈춘다. 재실행 때 이미 있는 시드를 건너뛰는 것은 시나리오의 몫이다(고정 Idempotency-Key). */
	async runAll(
		scenarios: readonly SeedScenario[],
		context: SeedContext,
	): Promise<SeedOutcome> {
		const ran: string[] = [];
		for (const scenario of scenarios) {
			try {
				await scenario.run(context);
			} catch (error) {
				return { ran, failed: { name: scenario.name, error } };
			}
			ran.push(scenario.name);
		}
		return { ran };
	}
}

/** 등록된 시나리오 — 아직 없다. */
export const SCENARIOS: readonly SeedScenario[] = [];

async function main(): Promise<number> {
	const loaded = loadConfig(
		baseSchema,
		new FileBackedEnvSource(new ProcessEnvSource()),
	);
	if (!loaded.ok) {
		console.error(`db:seed: 설정 오류 ${JSON.stringify(loaded.error.details)}`);
		return exitCodeFor(loaded.error);
	}
	const runner = new SeedRunner();
	if (!runner.guardEnvironment(loaded.value.config.APP_ENV)) {
		console.error("db:seed: APP_ENV=production 에서는 실행하지 않는다");
		return 1;
	}
	const outcome = await runner.runAll(SCENARIOS, {
		clock: new SystemClock(),
		ids: new UuidV7Generator(),
	});
	if (outcome.failed !== undefined) {
		console.error(
			`db:seed: 시나리오 ${outcome.failed.name} 실패 — ${outcome.failed.error instanceof Error ? outcome.failed.error.message : String(outcome.failed.error)}`,
		);
		return 1;
	}
	console.log(`db:seed: 시나리오 ${outcome.ran.length}개 실행`);
	return 0;
}

if (import.meta.main) {
	process.exitCode = await main();
}
