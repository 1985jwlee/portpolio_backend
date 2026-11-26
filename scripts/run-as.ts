// run-as — 역할별 접속 주소(`DATABASE_URL_<ROLE>`)를 자식 프로세스의 `DATABASE_URL` 로 매핑해 실행한다(TD-8 8-9, 02-dev-environment §5).
// 사용: `bun --env-file=.env scripts/run-as.ts <ROLE> <실행할 파일> [인자…]` — `.env` 는 부모 bun 이 읽어 환경변수로 넘긴다
// (파서를 이 파일에 따로 두면 Bun 의 따옴표·주석 규칙과 갈라진다).
// 자식에게는 자기 역할의 주소만 `DATABASE_URL` 로 준다 — 다른 역할의 비밀번호가 자식 환경에 남지 않게 `DATABASE_URL_*` 는 모두 뺀다.
// 종료 코드: 자식의 종료 코드 · 78 대상 변수가 없음 · 2 사용법 오류. 연결 주소는 출력하지 않고 변수 이름만 낸다.

const ROLE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const EXIT_USAGE = 2;
const EXIT_CONFIG = 78;

export type ChildEnv =
	| { readonly ok: true; readonly env: Record<string, string> }
	| { readonly ok: false; readonly missing: string };

/** 부모 환경에서 자식 환경을 만든다. 대상 변수가 없거나 비어 있으면 그 이름을 돌려준다. */
export function buildChildEnv(
	parent: Readonly<Record<string, string | undefined>>,
	role: string,
): ChildEnv {
	const name = `DATABASE_URL_${role}`;
	const url = parent[name];
	if (url === undefined || url === "") {
		return { ok: false, missing: name };
	}
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(parent)) {
		if (value !== undefined && !key.startsWith("DATABASE_URL_")) {
			env[key] = value;
		}
	}
	env.DATABASE_URL = url;
	return { ok: true, env };
}

async function main(args: readonly string[]): Promise<number> {
	const [role, ...entry] = args;
	if (role === undefined || !ROLE_PATTERN.test(role) || entry.length === 0) {
		console.error(
			"사용법: bun --env-file=.env scripts/run-as.ts <ROLE> <실행할 파일> [인자…]  (ROLE 예: API · WORKER · MIGRATOR)",
		);
		return EXIT_USAGE;
	}
	const child = buildChildEnv(process.env, role);
	if (!child.ok) {
		// 변수 이름만 낸다 — 값은 어디에도 싣지 않는다.
		console.error(`run-as: ${child.missing} 가 없다 — .env 를 확인한다`);
		return EXIT_CONFIG;
	}
	const proc = Bun.spawn([process.execPath, ...entry], {
		env: child.env,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return await proc.exited;
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
