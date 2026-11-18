// main.ts 의 S1-3 경계 몫(로드 → 요약 출력 / 실패 시 오류 출력과 종료 코드)을 흉내 내는 시험 전용 탐침.
// 자식 프로세스로만 실행된다. 예외를 던지지 않는다 — 미처리 오류 출력은 근처 소스 줄을 그대로 찍는다.
import {
	exitCodeFor,
	FileBackedEnvSource,
	loadConfig,
	ProcessEnvSource,
	summarize,
} from "@pf/config";
import { apiLike, workerLike } from "./sample-schemas.ts";

const samples = { apiLike, workerLike };

function runProbe(sampleName: string | undefined): void {
	if (sampleName !== "apiLike" && sampleName !== "workerLike") {
		process.stderr.write(`unknown sample: ${sampleName}\n`);
		process.exitCode = 2;
		return;
	}
	const source = new FileBackedEnvSource(new ProcessEnvSource());
	const result = loadConfig(samples[sampleName], source);
	if (!result.ok) {
		process.stderr.write(`${JSON.stringify(result.error)}\n`);
		process.exitCode = exitCodeFor(result.error);
		return;
	}
	process.stdout.write(`${JSON.stringify(summarize(result.value.config))}\n`);
}

runProbe(process.argv[2]);
