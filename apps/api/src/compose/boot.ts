// 프로세스 진입 — 설정을 읽고 운영 구현(시계·id·장애 훅·표준 출력 로그)을 꽂아 ApiRoot 를 띄운다.
// 설정 오류는 이름만 표준 오류에 내고 78 로 끝난다(값은 어디에도 싣지 않는다 — @pf/config 계약).
import {
	exitCodeFor,
	FileBackedEnvSource,
	loadConfig,
	ProcessEnvSource,
} from "@pf/config";
import { NoopFaults, runRoot, SystemClock, UuidV7Generator } from "@pf/infra";
import { StdoutJsonSink } from "@pf/observability";
import { apiSchema } from "../config.ts";
import { ApiRoot } from "./root.ts";

export async function runApi(): Promise<void> {
	const loaded = loadConfig(
		apiSchema,
		new FileBackedEnvSource(new ProcessEnvSource()),
	);
	if (!loaded.ok) {
		console.error(`api: 설정 오류 ${JSON.stringify(loaded.error.details)}`);
		process.exit(exitCodeFor(loaded.error));
	}
	const root = new ApiRoot({
		config: loaded.value.config,
		clock: new SystemClock(),
		ids: new UuidV7Generator(),
		faults: new NoopFaults(),
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
		drainDelayMs: loaded.value.config.DRAIN_DELAY_MS,
	});
}
