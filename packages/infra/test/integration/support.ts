// infra 통합 시험 기반 — 시험 DB 접속·pg_dump 실행·대기 도구. 시험 파일이 아니다(이름에 .test 없음).
// 계약: TEST_DATABASE_URL 은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터를 가리킨다.
// 없으면 건너뛰지 않고 실패한다 — 조용히 0건으로 끝나는 것이 가장 나쁜 실패다.
// 환경변수는 제품 소스가 아니라 이 시험 지원 파일에서만 읽는다(B9-env) — 시험 대상에는 인자로 넘긴다.

export function adminUrl(): string {
	const url = process.env.TEST_DATABASE_URL;
	if (url === undefined || url === "") {
		throw new Error(
			"TEST_DATABASE_URL 이 없다 — 통합 시험은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터가 필요하다 (예: postgres://postgres:pw@127.0.0.1:5432/postgres)",
		);
	}
	return url;
}

const POLL_INTERVAL_MS = 25;

/** 조건이 참이 될 때까지 폴링한다. 상한을 넘기면 던진다 — 고정 sleep 으로 순서를 맞추지 않는다. */
export async function waitFor(
	label: string,
	condition: () => boolean,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error(`대기 초과(${timeoutMs}ms): ${label}`);
		}
		await Bun.sleep(POLL_INTERVAL_MS);
	}
}

/**
 * pg_dump 실행 접두 — env `PF_PG_DUMP`(공백으로 나눈 명령 접두), 없으면 PATH 의 `pg_dump`.
 * 셸을 거치지 않고 인자 배열로 실행한다. 이 값은 시험을 돌리는 사람이 정하는 명령이다(CI 는 워크플로 파일이 정한다).
 */
export function pgDumpCommand(): string[] {
	const configured = process.env.PF_PG_DUMP;
	if (configured === undefined || configured.trim() === "") {
		return ["pg_dump"];
	}
	return configured.trim().split(/\s+/);
}

/**
 * 한 스키마를 pg_dump 해 표준 출력 전체를 돌려준다(스키마 + 데이터, 평문 SQL).
 * 실행할 수 없거나 종료 코드가 0 이 아니면 던진다 — 건너뛰면 "센티널 없음" 이 거짓 초록이 된다.
 */
export async function dumpSchema(
	databaseUrl: string,
	schema: string,
): Promise<string> {
	const command = [
		...pgDumpCommand(),
		`--schema=${schema}`,
		`--dbname=${databaseUrl}`,
	];
	let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
	} catch (error) {
		throw new Error(
			`pg_dump 를 실행하지 못했다 — PATH 에 pg_dump 가 없거나 env PF_PG_DUMP 가 틀렸다 (실행 접두: ${pgDumpCommand().join(" ")})`,
			{ cause: error },
		);
	}
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(
			`pg_dump 가 종료 코드 ${exitCode} 로 실패했다 (env PF_PG_DUMP 를 확인): ${stderr.trim()}`,
		);
	}
	return stdout;
}
