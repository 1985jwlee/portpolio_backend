// 격리 타입체크·번들 검사 — 모듈이 자기가 선언한 `@pf/*` 의존만으로 타입체크·번들되는지 본다(ADR-052 결정 5, G11 기준 4c, S1-18).
// 워크스페이스 링크는 선언하지 않은 `@pf/*` 도 해석해 주므로(TD-7 7-3) 정적 임포트 검사나 저장소 안의 `tsc -b` 로는 "선언 누락" 을 못 본다.
// 그래서 모듈마다 임시 디렉토리에 그 모듈과 선언한 의존(전이 포함)만 복사해 놓고 거기서 검사한다.
//
// 타입체크가 필수인 이유(G11 spikes/g11-module-extraction/ENV.md): 계약은 대개 `import type` 으로만 쓰여 런타임 임포트가 0 이라,
// 계약 복사본이 없어도 `bun build` 는 성공한다. 번들 검사는 런타임 임포트가 있는 모듈의 누락만 잡는 보조다.
//
// 한계: 임시 디렉토리에는 npm 패키지(drizzle-orm 등)와 Bun·Node 타입이 없어 타입체크가 `@pf/*` 와 무관한 오류를 잔뜩 낸다 —
// `@pf/*` 모듈을 못 찾는 TS2307 만 집계하고 나머지는 버린다. 즉 이 검사는 "선언한 `@pf/*` 의존의 충분성" 만 보증한다.
// 시험(`test/`)과 devDependencies 는 대상이 아니다(추출될 때 따라가지 않는다). 번들은 `src/index.ts` 가 있는 모듈만, npm 의존은 external 이다.
// 종료 코드: 0 위반 없음 · 1 위반 있음. 출력은 arch.ts 와 같은 `<규칙> <모듈> (<사유>)` 줄 + 요약 한 줄.
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export type IsolationFinding = {
	readonly rule: string;
	/** 검사 루트 기준 모듈 디렉토리(`modules/<m>`). */
	readonly module: string;
	readonly detail: string;
};

export const ISOLATED_RULE_IDS: readonly string[] = [
	"ISO-unknown-dep",
	"ISO-type-missing",
	"ISO-bundle",
];

type WorkspacePackage = {
	readonly name: string;
	readonly dir: string;
	/** `dependencies` 의 `@pf/*` 이름. */
	readonly pfDeps: readonly string[];
	/** `dependencies` 의 나머지(npm) 이름. */
	readonly npmDeps: readonly string[];
};

const TS2307 =
	/^(.*?)\((\d+),\d+\): error TS2307: Cannot find module '(@pf\/[^']+)'/;

/** tsc(`--pretty false`) 출력에서 `@pf/*` 모듈을 못 찾는 TS2307 만 `모듈 — 위치` 로 뽑는다. 중복은 모듈 단위로 합친다. */
export function parseMissingPfModules(output: string): string[] {
	const found = new Map<string, string>();
	for (const line of output.split("\n")) {
		const match = TS2307.exec(line.trim());
		const specifier = match?.[3];
		if (match !== null && specifier !== undefined && !found.has(specifier)) {
			found.set(specifier, `${match[1]}:${match[2]}`);
		}
	}
	return [...found].map(([specifier, where]) => `${specifier} — ${where}`);
}

function readManifest(dir: string): WorkspacePackage | undefined {
	const path = `${dir}/package.json`;
	if (!existsSync(path)) {
		return undefined;
	}
	const json: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (typeof json !== "object" || json === null) {
		return undefined;
	}
	const name = Reflect.get(json, "name");
	const deps: unknown = Reflect.get(json, "dependencies");
	if (typeof name !== "string") {
		return undefined;
	}
	const names =
		typeof deps === "object" && deps !== null ? Object.keys(deps) : [];
	return {
		name,
		dir,
		pfDeps: names.filter((n) => n.startsWith("@pf/")),
		npmDeps: names.filter((n) => !n.startsWith("@pf/")),
	};
}

/** 검사 루트의 `packages/*`·`modules/*` 를 이름으로 색인한다. */
function indexWorkspace(root: string): Map<string, WorkspacePackage> {
	const index = new Map<string, WorkspacePackage>();
	for (const group of ["packages", "modules"]) {
		if (!existsSync(`${root}/${group}`)) {
			continue;
		}
		for (const entry of readdirSync(`${root}/${group}`, {
			withFileTypes: true,
		})) {
			const pkg = entry.isDirectory()
				? readManifest(`${root}/${group}/${entry.name}`)
				: undefined;
			if (pkg !== undefined) {
				index.set(pkg.name, pkg);
			}
		}
	}
	return index;
}

/** 선언한 `@pf/*` 의존의 전이 폐포. 워크스페이스에 없는 이름은 `unknown` 으로 따로 돌려준다. */
function closureOf(
	start: WorkspacePackage,
	index: ReadonlyMap<string, WorkspacePackage>,
): { found: WorkspacePackage[]; unknown: string[] } {
	const found = new Map<string, WorkspacePackage>();
	const unknown = new Set<string>();
	const queue = [...start.pfDeps];
	for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
		if (found.has(name) || unknown.has(name)) {
			continue;
		}
		const pkg = index.get(name);
		if (pkg === undefined) {
			unknown.add(name);
			continue;
		}
		found.set(name, pkg);
		queue.push(...pkg.pfDeps);
	}
	return { found: [...found.values()], unknown: [...unknown] };
}

function copyPackage(from: string, to: string): void {
	cpSync(from, to, {
		recursive: true,
		filter: (path) =>
			basename(path) !== "node_modules" && !path.endsWith(".tsbuildinfo"),
	});
}

// 임시 디렉토리의 tsconfig — 의존 해석에 필요한 것만 둔다. 엄격도 옵션은 TS2307 판정과 무관하다.
const ISOLATED_TSCONFIG = {
	compilerOptions: {
		target: "ESNext",
		module: "Preserve",
		moduleResolution: "bundler",
		lib: ["ESNext"],
		types: [],
		allowImportingTsExtensions: true,
		noEmit: true,
		skipLibCheck: true,
		strict: true,
	},
	include: ["pkg/src"],
};

type Spawned = { code: number; out: string };

function spawn(cmd: string[], cwd: string): Spawned {
	const child = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	return {
		code: child.exitCode,
		out: `${child.stdout.toString()}${child.stderr.toString()}`.trim(),
	};
}

export type IsolatedOptions = {
	/** 격리 검사에 쓸 typescript 의 `bin/tsc` 경로. 검사 루트가 아니라 이 저장소의 것을 쓴다. */
	readonly tscPath: string;
};

function checkModule(
	root: string,
	moduleDir: string,
	index: ReadonlyMap<string, WorkspacePackage>,
	options: IsolatedOptions,
): IsolationFinding[] {
	const manifest = readManifest(`${root}/${moduleDir}`);
	if (manifest === undefined) {
		return [];
	}
	const { found, unknown } = closureOf(manifest, index);
	const findings: IsolationFinding[] = unknown.map((name) => ({
		rule: "ISO-unknown-dep",
		module: moduleDir,
		detail: `선언한 의존 ${name} 이 워크스페이스에 없다`,
	}));

	const tmp = mkdtempSync(join(tmpdir(), "isolated-"));
	try {
		for (const pkg of found) {
			copyPackage(pkg.dir, join(tmp, "node_modules", pkg.name));
		}
		copyPackage(manifest.dir, join(tmp, "pkg"));
		writeFileSync(
			join(tmp, "tsconfig.json"),
			JSON.stringify(ISOLATED_TSCONFIG),
		);

		const tsc = spawn(
			[
				process.execPath,
				options.tscPath,
				"-p",
				"tsconfig.json",
				"--pretty",
				"false",
			],
			tmp,
		);
		for (const missing of parseMissingPfModules(tsc.out)) {
			findings.push({
				rule: "ISO-type-missing",
				module: moduleDir,
				detail: `선언한 의존만으로는 타입체크에서 ${missing} 를 찾지 못한다`,
			});
		}

		const entry = join(tmp, "pkg", "src", "index.ts");
		if (existsSync(entry)) {
			const externals = [
				...new Set([...manifest.npmDeps, ...found.flatMap((p) => p.npmDeps)]),
			].flatMap((name) => ["--external", name, "--external", `${name}/*`]);
			mkdirSync(join(tmp, "out"));
			const bundle = spawn(
				[
					process.execPath,
					"build",
					entry,
					"--target=bun",
					"--outfile",
					join(tmp, "out", "index.js"),
					...externals,
				],
				tmp,
			);
			if (bundle.code !== 0) {
				findings.push({
					rule: "ISO-bundle",
					module: moduleDir,
					detail: `선언한 의존만으로는 번들되지 않는다: ${bundle.out.split("\n").slice(0, 3).join(" ")}`,
				});
			}
		}
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
	return findings;
}

/** 검사 루트의 모듈(`modules/*`)마다 격리 검사를 돌린다. */
export function checkIsolated(
	root: string,
	options: IsolatedOptions,
): { modules: string[]; findings: IsolationFinding[] } {
	const index = indexWorkspace(root);
	const modules = existsSync(`${root}/modules`)
		? readdirSync(`${root}/modules`, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => `modules/${entry.name}`)
				.filter((dir) => existsSync(`${root}/${dir}/package.json`))
				.sort()
		: [];
	const findings = modules.flatMap((dir) =>
		checkModule(root, dir, index, options),
	);
	return { modules, findings };
}

export function formatFinding(f: IsolationFinding): string {
	return `${f.rule} ${f.module} (${f.detail})`;
}

if (import.meta.main) {
	const repo = fileURLToPath(new URL("../", import.meta.url)).replace(
		/[\\/]$/,
		"",
	);
	const root = (process.argv[2] ?? repo).replace(/[\\/]$/, "");
	const { modules, findings } = checkIsolated(root, {
		tscPath: join(repo, "node_modules", "typescript", "bin", "tsc"),
	});
	for (const finding of findings) {
		console.log(formatFinding(finding));
	}
	console.log(
		modules.length === 0
			? "check:isolated: 검사 대상 0 (모듈 없음)"
			: `check:isolated: 모듈 ${modules.length} · 위반 ${findings.length}`,
	);
	process.exitCode = findings.length === 0 ? 0 : 1;
}
