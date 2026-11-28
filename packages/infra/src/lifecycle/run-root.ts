// 앱 진입의 공통 골격 — 신호 처리기를 걸고 시작한다. 시작이 실패하면 그 코드로 종료한다(DB 불가 69·설정 78·그 밖 70).
import { describeError, exitCodeOf, type LifecycleLog } from "./component.ts";
import type { CompositionRoot } from "./composition-root.ts";
import { ShutdownCoordinator } from "./shutdown-coordinator.ts";

export async function runRoot(options: {
	readonly root: CompositionRoot;
	readonly draining: { setDraining(flag: boolean): void };
	readonly log: LifecycleLog;
	readonly exit: (code: number) => void;
	readonly graceMs?: number;
	readonly drainDelayMs?: number;
}): Promise<ShutdownCoordinator> {
	const { root, draining, log, exit, graceMs, drainDelayMs } = options;
	const coordinator = new ShutdownCoordinator({
		root,
		draining,
		log,
		exit,
		...(graceMs === undefined ? {} : { graceMs }),
		...(drainDelayMs === undefined ? {} : { drainDelayMs }),
	});
	coordinator.install();
	try {
		await root.start();
	} catch (error) {
		log.error("startup failed", { error: describeError(error) });
		exit(exitCodeOf(error));
	}
	return coordinator;
}
