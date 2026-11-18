// 경계 검사 실행기 — `bun run arch` 의 유일한 진입점이다(docs/design/01-repository-structure.md §5·§6).
// 파일시스템을 읽는 곳은 이 파일뿐이고, 판정은 순수 함수에 맡긴다:
//   그래프 규칙 → .dependency-cruiser.cjs (이 파일이 API 로 한 번 돌린다)
//   B3 → check-cqrs.ts · 문자열 규칙 → check-purity.ts · B5·비공허성 가드 → 이 파일
// 위반이 하나라도 있으면 종료 1. 하나가 실패해도 나머지를 다 돌려 합쳐 보여 준다.
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import { checkCqrs } from "./check-cqrs.ts";
import { isProductSource, scanPurity } from "./check-purity.ts";

export type ArchViolation = {
	readonly rule: string;
	readonly from: string;
	readonly to?: string;
	readonly line?: number;
	readonly detail?: string;
};

export type ArchReport = {
	readonly ok: boolean;
	readonly violations: ReadonlyArray<ArchViolation>;
	readonly counts: {
		readonly enumerated: number;
		readonly cruisedLocal: number;
		readonly purityFiles: number;
		readonly cqrsModules: number;
	};
	/** 독립 열거한 소스 경로(검사 루트 기준) — 알려진 파일이 열거에 있는지 시험이 확인한다. */
	readonly enumeratedFiles: ReadonlyArray<string>;
};

type Edge = { readonly from: string; readonly to: string };

/** 검사 루트 다섯 개 — 모두 존재해야 한다(없으면 cruise 가 ENOENT 를 던진다). */
const ROOTS = ["apps", "modules", "packages", "scripts", "test"] as const;

const CONFIG_PATH = fileURLToPath(
	new URL("../.dependency-cruiser.cjs", import.meta.url),
);

/**
 * 비공허성 가드. 독립 열거한 파일이 하나도 없으면 GUARD-empty, 열거했는데 cruise 결과에 없는 것이 있으면
 * GUARD-uncruised(파일마다 한 건). 개수가 아니라 집합 포함으로 판정한다 — totalCruised 는 내장·npm 까지 센다.
 */
export function findUncruised(
	expected: ReadonlyArray<string>,
	cruisedLocal: ReadonlySet<string>,
): ArchViolation[] {
	if (expected.length === 0) {
		return [
			{
				rule: "GUARD-empty",
				from: ".",
				detail: "독립 열거한 소스가 0 개 — 검사가 아무것도 보지 않았다",
			},
		];
	}
	return expected
		.filter((path) => !cruisedLocal.has(path))
		.map((path) => ({
			rule: "GUARD-uncruised",
			from: path,
			detail: "열거됐지만 dependency-cruiser 결과에 없다",
		}));
}

/** apps·modules·packages 아래 경로를 패키지 단위 노드로 접는다. 접히지 않으면 undefined. */
function packageOf(path: string): string | undefined {
	return /^(apps|modules|packages)\/[^/]+/.exec(path)?.[0];
}

/**
 * B5 — 패키지 단위 순환. 파일 간선을 패키지로 접은 그래프의 강연결요소(Tarjan) 중 크기 2 이상을 낸다.
 * 같은 패키지 안 파일 순환은 대상이 아니다. type-only 간선도 센다.
 */
export function findPackageCycles(edges: ReadonlyArray<Edge>): ArchViolation[] {
	const graph = new Map<string, Set<string>>();
	for (const edge of edges) {
		const from = packageOf(edge.from);
		const to = packageOf(edge.to);
		if (from === undefined || to === undefined || from === to) {
			continue;
		}
		graph.set(from, (graph.get(from) ?? new Set()).add(to));
		if (!graph.has(to)) {
			graph.set(to, new Set());
		}
	}

	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const components: string[][] = [];
	let counter = 0;

	const visit = (node: string): void => {
		index.set(node, counter);
		low.set(node, counter);
		counter += 1;
		stack.push(node);
		onStack.add(node);
		for (const next of graph.get(node) ?? []) {
			if (!index.has(next)) {
				visit(next);
				low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
			} else if (onStack.has(next)) {
				low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
			}
		}
		if (low.get(node) !== index.get(node)) {
			return;
		}
		const component: string[] = [];
		for (;;) {
			const member = stack.pop();
			if (member === undefined) {
				break;
			}
			onStack.delete(member);
			component.push(member);
			if (member === node) {
				break;
			}
		}
		components.push(component);
	};

	for (const node of [...graph.keys()].sort()) {
		if (!index.has(node)) {
			visit(node);
		}
	}

	return components
		.filter((component) => component.length >= 2)
		.map((component) => {
			const members = [...component].sort();
			return {
				rule: "B5-module-cycle",
				from: members[0] ?? "",
				detail: members.join(" ↔ "),
			};
		});
}

/** options.exclude 의 path 패턴을 정규식 목록으로 푼다(열거에도 같은 제외를 쓰기 위해 한 곳에서 읽는다). */
function excludePatterns(
	exclude: string | string[] | { path?: string | string[] } | undefined,
): RegExp[] {
	if (exclude === undefined) {
		return [];
	}
	const raw =
		typeof exclude === "string" || Array.isArray(exclude)
			? exclude
			: exclude.path;
	const list = typeof raw === "string" ? [raw] : (raw ?? []);
	return list.map((pattern) => new RegExp(pattern));
}

/**
 * 다섯 루트 아래 소스를 독립적으로 열거한다(cruise 결과를 믿지 않는 두 번째 눈).
 * 확장자는 dependency-cruiser 가 읽는 JS·TS 계열 전부이고 점 디렉토리도 본다 — 문자열 규칙이 cruise 보다 좁으면
 * `.mts`·`.js`·`.hidden/` 아래 파일이 문자열 규칙만 조용히 피한다.
 */
async function enumerateSources(
	root: string,
	excluded: readonly RegExp[],
): Promise<string[]> {
	const glob = new Bun.Glob("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}");
	const found: string[] = [];
	for (const dir of ROOTS) {
		for await (const relative of glob.scan({
			cwd: `${root}/${dir}`,
			dot: true,
		})) {
			// Bun.Glob.scan 은 Windows 에서 `\` 구분 경로를 돌려준다 — 제외 패턴·isProductSource 가 `/` 를 전제하므로 정규화한다.
			const path = `${dir}/${relative.replaceAll("\\", "/")}`;
			if (path.split("/").includes("node_modules")) {
				continue;
			}
			if (excluded.some((pattern) => pattern.test(path))) {
				continue;
			}
			found.push(path);
		}
	}
	return found.sort();
}

/** JSON 파일을 읽는다. 파일이 없으면 undefined, 파싱에 실패하면 null(위반 판정은 check-cqrs 가 한다). */
async function readJson(path: string): Promise<unknown> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return undefined;
	}
	try {
		return await file.json();
	} catch {
		return null;
	}
}

async function readDeclarations(root: string): Promise<Map<string, unknown>> {
	const declarations = new Map<string, unknown>();
	const glob = new Bun.Glob("*/port-kinds.json");
	for await (const scanned of glob.scan({ cwd: `${root}/modules` })) {
		// 위 enumerateSources 와 같은 이유로 `\` 를 `/` 로 정규화한다.
		const relative = scanned.replaceAll("\\", "/");
		const module = relative.split("/")[0];
		if (module !== undefined) {
			declarations.set(module, await readJson(`${root}/modules/${relative}`));
		}
	}
	return declarations;
}

function byViolationOrder(a: ArchViolation, b: ArchViolation): number {
	return (
		a.rule.localeCompare(b.rule) ||
		a.from.localeCompare(b.from) ||
		(a.to ?? "").localeCompare(b.to ?? "") ||
		(a.line ?? 0) - (b.line ?? 0)
	);
}

/** `root`(검사 루트 절대경로 — 실저장소 또는 픽스처)를 검사한다. */
export async function runArch(root: string): Promise<ArchReport> {
	// 설정은 항상 저장소의 것을 읽는다 — 픽스처는 루트만 바꾼다.
	const config = await extractDepcruiseConfig(CONFIG_PATH);
	if (config.forbidden === undefined) {
		throw new Error(`${CONFIG_PATH} 에 forbidden 규칙이 없다`);
	}
	const result = await cruise([...ROOTS], {
		...config.options,
		ruleSet: { forbidden: config.forbidden },
		validate: true,
		baseDir: root,
	});
	// 위반이 있어도 result.exitCode 는 0 이다 — 판정은 summary.violations 에서 읽는다.
	if (typeof result.output === "string") {
		throw new Error("dependency-cruiser 가 객체 대신 문자열을 돌려줬다");
	}
	const { modules, summary } = result.output;

	const cruisedLocal = new Set(
		modules
			.filter(
				(m) =>
					!m.coreModule &&
					!m.couldNotResolve &&
					!m.source.includes("node_modules"),
			)
			.map((m) => m.source),
	);
	const edges: Edge[] = modules
		.filter((m) => cruisedLocal.has(m.source))
		.flatMap((m) =>
			m.dependencies
				.filter((d) => cruisedLocal.has(d.resolved))
				.map((d) => ({ from: m.source, to: d.resolved })),
		);

	const enumerated = await enumerateSources(
		root,
		excludePatterns(config.options?.exclude),
	);

	const purityPaths = enumerated.filter(isProductSource);
	const purityViolations: ArchViolation[] = [];
	for (const path of purityPaths) {
		const text = await Bun.file(`${root}/${path}`).text();
		purityViolations.push(...scanPurity(path, text));
	}

	const declarations = await readDeclarations(root);
	const exceptions = await readJson(`${root}/modules/cqrs-exceptions.json`);

	const graphViolations: ArchViolation[] = summary.violations.map((v) => ({
		rule: v.rule.name,
		from: v.from,
		to: v.to,
	}));

	const violations = [
		...graphViolations,
		...findUncruised(enumerated, cruisedLocal),
		...findPackageCycles(edges),
		...checkCqrs({ edges, files: cruisedLocal, declarations, exceptions }),
		...purityViolations,
	].sort(byViolationOrder);

	return {
		ok: violations.length === 0,
		violations,
		counts: {
			enumerated: enumerated.length,
			cruisedLocal: cruisedLocal.size,
			purityFiles: purityPaths.length,
			cqrsModules: declarations.size,
		},
		enumeratedFiles: enumerated,
	};
}

function formatViolation(v: ArchViolation): string {
	const where = v.line === undefined ? v.from : `${v.from}:${v.line}`;
	const target = v.to === undefined ? "" : ` → ${v.to}`;
	const detail = v.detail === undefined ? "" : ` (${v.detail})`;
	return `${v.rule} ${where}${target}${detail}`;
}

if (import.meta.main) {
	const repoRoot = fileURLToPath(new URL("../", import.meta.url));
	// 예외는 잡지 않는다 — 고장이면 Bun 이 종료 1 로 끝낸다.
	const report = await runArch(repoRoot);
	for (const violation of report.violations) {
		console.log(formatViolation(violation));
	}
	const { counts } = report;
	console.log(
		`arch: 열거 ${counts.enumerated} · 검사된 로컬 소스 ${counts.cruisedLocal} · purity 대상 ${counts.purityFiles} · cqrs 모듈 ${counts.cqrsModules} · 위반 ${report.violations.length}`,
	);
	process.exitCode = report.ok ? 0 : 1;
}
