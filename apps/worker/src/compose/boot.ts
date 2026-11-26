// 프로세스 진입 — 설정을 읽고 운영 구현을 꽂아 WorkerRoot 를 띄운다. 설정 오류는 이름만 내고 78 로 끝난다.
import {
	exitCodeFor,
	FileBackedEnvSource,
	loadConfig,
	ProcessEnvSource,
} from "@pf/config";
import { runRoot, SystemClock, UuidV7Generator } from "@pf/infra";
import { StdoutJsonSink } from "@pf/observability";
import { workerSchema } from "../config.ts";
import { WorkerRoot } from "./root.ts";

export async function runWorker(): Promise<void> {
	const loaded = loadConfig(
		workerSchema,
		new FileBackedEnvSource(new ProcessEnvSource()),
	);
	if (!loaded.ok) {
		console.error(`worker: 설정 오류 ${JSON.stringify(loaded.error.details)}`);
		process.exit(exitCodeFor(loaded.error));
	}
	const root = new WorkerRoot({
		config: loaded.value.config,
		clock: new SystemClock(),
		ids: new UuidV7Generator(),
		sink: new StdoutJsonSink(),
	});
	for (const warning of loaded.value.warnings) {
		root.log.warn("config warning", { ...warning });
	}
	await runRoot({
		root,
		draining: root.health,
		log: root.log,
		exit: (code) => process.exit(code),
	});
}
