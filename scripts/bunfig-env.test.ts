// TD-5 — 루트 bunfig.toml 의 `env = false` 가 .env 자동 로드를 막는지 자식 `bun test` 로 확인한다.
// 임시 디렉토리는 저장소 밖(os.tmpdir)이다. 저장소 안에 두면 바깥 bun test 가 탐침 시험 파일을 함께 집어 간다.
// 저장소 루트에는 .env 를 만들지 않는다(개발자의 실제 .env 를 덮을 수 있다).
// 이 시험은 루트 bunfig.toml 을 통째로 복사한다. [test] preload 처럼 상대 경로를 가리키는 키가 생기면(08 G9 — S1-6·S1-10) 임시 디렉토리에 그 파일이 없어 D2 가 preload not found 로 거짓 빨강이 된다 — 그때 이 시험을 고친다(D2 를 지우거나 빼지 않는다).
import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 이 파일은 <저장소 루트>/scripts/ 에 있으므로 한 단계 위가 저장소 루트다.
const repoRoot = new URL("../", import.meta.url);
const TIMEOUT_MS = 20000;
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// .env 한 줄과 그 변수를 출력하는 탐침 시험 파일을 둔 임시 디렉토리를 만든다.
function makeProbeDir(sentinel: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pf-bunfig-"));
	tempDirs.push(dir);
	writeFileSync(join(dir, ".env"), `PF_DOTENV_PROBE=${sentinel}\n`);
	writeFileSync(
		join(dir, "probe.test.ts"),
		[
			'import { test } from "bun:test";',
			'test("probe", () => { console.log("PROBE=" + (process.env.PF_DOTENV_PROBE ?? "unset")); });',
			"",
		].join("\n"),
	);
	return dir;
}

// 자식 bun test 를 부모 환경 없이 돌리고 stdout+stderr 를 합쳐 돌려준다.
function runBunTest(cwd: string): string {
	const child = Bun.spawnSync([process.execPath, "test"], {
		cwd,
		env: {},
		stdout: "pipe",
		stderr: "pipe",
		timeout: 10000,
	});
	return child.stdout.toString() + child.stderr.toString();
}

describe("TD-5 .env 자동 로드 차단", () => {
	test(
		"D1 대조군 — bunfig.toml 이 없으면 .env 의 값이 시험에서 보인다",
		() => {
			const sentinel = crypto.randomUUID();
			const output = runBunTest(makeProbeDir(sentinel));
			// 이 단정이 매번 .env 로드를 감지할 수 있음을 증명한다. 이것이 깨지면 D2 는 아무것도 증명하지 못한다.
			expect(output).toContain(sentinel);
		},
		TIMEOUT_MS,
	);

	test(
		"D2 루트 bunfig.toml 을 그대로 복사해 넣으면 같은 .env 가 보이지 않는다",
		() => {
			const sentinel = crypto.randomUUID();
			const dir = makeProbeDir(sentinel);
			copyFileSync(new URL("bunfig.toml", repoRoot), join(dir, "bunfig.toml"));
			const output = runBunTest(dir);
			expect(output).toContain("PROBE=unset");
			expect(output).not.toContain(sentinel);
		},
		TIMEOUT_MS,
	);
});
