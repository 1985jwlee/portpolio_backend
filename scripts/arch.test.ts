// 경계 검사(S1-5) 시험 — docs/design/01-repository-structure.md §5, docs/design/08-test-strategy.md §2.
// 위반·통과·빈 픽스처 트리(scripts/fixtures/arch/)와 저장소 자신을 읽기만 한다.
// 쓰기·네트워크·서브프로세스·process.chdir 를 쓰지 않는다 — 작업 디렉토리를 바꾸지 않으므로 병렬 실행에서도 서로 밟지 않는다.
// 판정 로직(findUncruised·findPackageCycles)은 메모리 입력으로, 픽스처 실행은 같은 체크아웃의 추적 파일을 읽어 확인한다.
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { getAvailableTranspilers } from "dependency-cruiser";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import {
	type ArchViolation,
	findPackageCycles,
	findUncruised,
	runArch,
} from "./arch.ts";
import { CQRS_RULE_IDS } from "./check-cqrs.ts";
import { PURITY_RULE_IDS } from "./check-purity.ts";

// 이 파일은 <저장소 루트>/scripts/ 에 있으므로 한 단계 위가 저장소 루트다.
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const fixture = (name: string) =>
	fileURLToPath(new URL(`fixtures/arch/${name}`, import.meta.url));
const configPath = fileURLToPath(
	new URL("../.dependency-cruiser.cjs", import.meta.url),
);

/** 위반을 한 줄로 줄인다 — 그래프 규칙은 출발 → 도착, 문자열 규칙은 출발:줄. */
function label(v: ArchViolation): string {
	const where = v.line === undefined ? v.from : `${v.from}:${v.line}`;
	return v.to === undefined
		? `${v.rule} ${where}`
		: `${v.rule} ${where} → ${v.to}`;
}

const sorted = (lines: readonly string[]) => [...lines].sort();

/**
 * 위반 트리의 기대 집합. 값은 최종 설정으로 실제로 돌려 확인한 것이고, 줄마다 픽스처 파일 첫머리 주석의 의도와 대조했다.
 * 한 파일이 규칙 둘을 함께 띄우는 곳은 의도한 겹침이다:
 *  - mod-a/deep.ts: 다른 모듈의 내부 파일 → B4-deep-module + B13-impl-module
 *  - packages/db/d.ts: db 가 스키마 진입 외 모듈 파일 → B4-deep-db + B7-packages-up
 *  - m1/usecase/u.ts: usecase → adapter → B1-usecase + B6-adapter
 */
const EXPECTED_VIOLATING: readonly string[] = [
	"B1-domain modules/m1/src/domain/x.ts → modules/m1/src/service/s.ts",
	"B1-service modules/m1/src/service/s.ts → modules/m1/src/usecase/u.ts",
	"B1-port modules/m1/src/port/p.ts → modules/m1/src/usecase/u.ts",
	"B1-usecase modules/m1/src/usecase/u.ts → modules/m1/src/adapter/a.ts",
	"B6-adapter modules/m1/src/usecase/u.ts → modules/m1/src/adapter/a.ts",
	"B2-core modules/m2/src/domain/io.ts → fs",
	"B2-core modules/m2/src/service/bun.ts → bun",
	"B2-io-package modules/m2/src/domain/db.ts → packages/db/src/index.ts",
	"B2-time-random modules/m2/src/domain/clock.ts:2",
	"B2-time-random modules/m2/src/domain/clock.ts:3",
	"B2-time-random modules/m2/src/domain/clock.ts:4",
	"B2-time-random modules/m2/src/domain/clock.ts:5",
	"B3-command-read modules/cq/src/usecase/command/read-in-command.ts → modules/cq/src/port/read-view.ts",
	"B3-query-write modules/cq/src/usecase/query/write-in-query.ts → modules/cq/src/port/write-repo.ts",
	"B3-undeclared-port modules/cq/src/usecase/query/undeclared.ts → modules/cq/src/port/undeclared.ts",
	"B3-declaration modules/cq/port-kinds.json → modules/cq/src/port/bad-read.ts",
	"B4-deep-module modules/mod-a/src/deep.ts → modules/mod-b/src/domain/secret.ts",
	"B4-deep-outside test/t.ts → modules/mod-b/src/adapter/postgres/schema.ts",
	// 조립만 모듈 adapter 를 임포트할 수 있다(Q2) — 조립 밖 앱 코드의 같은 임포트는 B4·B13 둘 다 띄운다.
	"B4-deep-outside apps/api/src/routes/adapter.ts → modules/m1/src/adapter/a.ts",
	"B4-deep-compose apps/api/src/compose/deep.ts → modules/mod-b/src/domain/secret.ts",
	"B4-deep-db packages/db/src/d.ts → modules/mod-b/src/domain/secret.ts",
	"B5-module-cycle packages/alpha",
	"B7-packages-up packages/up/src/x.ts → modules/mod-b/src/index.ts",
	"B7-packages-up packages/db/src/d.ts → modules/mod-b/src/domain/secret.ts",
	"B7-modules-up modules/mod-up/src/x.ts → apps/api/src/y.ts",
	"B7-kernel packages/kernel/src/k.ts → fs",
	"B8-web apps/web/src/x.tsx → packages/db/src/index.ts",
	"B9-env modules/m3/src/usecase/env.ts:2",
	// 문자열 규칙이 cruise 와 같은 확장자·점 디렉토리를 읽는지(열거 범위) — 하나라도 좁으면 그 줄이 빠져 빨강이 된다.
	"B9-env modules/m3/src/usecase/env.mts:2",
	"B9-env modules/m3/src/usecase/env.cts:2",
	"B9-env modules/m3/src/usecase/env.js:2",
	"B9-env modules/m3/src/usecase/env.jsx:2",
	"B9-env modules/m3/src/usecase/env.mjs:2",
	"B9-env modules/m3/src/usecase/env.cjs:2",
	"B9-env modules/m3/src/usecase/.hidden/env.ts:2",
	"B9-process-import modules/m3/src/usecase/proc.ts → process",
	"B10-infra modules/m3/src/usecase/infra.ts → packages/infra/src/index.ts",
	"B10-infra apps/api/src/routes/i.ts → packages/infra/src/index.ts",
	"B11-write modules/m3/src/usecase/write.ts:3",
	"B11-raw-sql modules/m3/src/adapter/postgres/sql.ts:2",
	"B13-impl-module modules/mod-a/src/index.ts → modules/mod-b/src/index.ts",
	// import type 도 구현 임포트로 센다(ADR-052 G11 교훈).
	"B13-impl-module modules/mod-a/src/typed.ts → modules/mod-b/src/index.ts",
	"B13-impl-module modules/mod-a/src/deep.ts → modules/mod-b/src/domain/secret.ts",
	"B13-impl-app apps/api/src/routes/r.ts → modules/mod-b/src/index.ts",
	"B13-impl-app apps/api/src/routes/adapter.ts → modules/m1/src/adapter/a.ts",
	"B13-contract modules/mod-b-contract/src/c.ts → packages/db/src/index.ts",
	"B14-identity modules/mod-a/src/id.ts → modules/identity-contract/src/index.ts",
	"unresolvable modules/mod-a/src/absent.ts → @fixture/absent",
];

/** 빈 트리·순수 함수 시험이 따로 보는 가드 ID — 위반 트리에서는 나오지 않는다. */
const GUARD_IDS = ["GUARD-empty", "GUARD-uncruised"];

const ruleOf = (line: string) => line.split(" ")[0] ?? "";

describe("경계 검사 판정 (픽스처 트리)", () => {
	test("T1 위반 트리: 위반 집합이 기대 표와 정확히 같다", async () => {
		const report = await runArch(fixture("violating"));
		expect(report.ok).toBe(false);
		expect(sorted(report.violations.map(label))).toEqual(
			sorted(EXPECTED_VIOLATING),
		);
	});

	test("T2 통과 트리: 위반 0 이고 범위 안 파일이 비어 있지 않다", async () => {
		const report = await runArch(fixture("passing"));
		expect(report.violations.map(label)).toEqual([]);
		expect(report.ok).toBe(true);
		expect(report.counts.enumerated).toBeGreaterThan(0);
		expect(report.counts.purityFiles).toBeGreaterThan(0);
		expect(report.counts.cqrsModules).toBeGreaterThan(0);
	});

	test("T3 빈 트리: 위반이 GUARD-empty 하나뿐이다", async () => {
		const report = await runArch(fixture("empty"));
		expect(report.violations.map((v) => v.rule)).toEqual(["GUARD-empty"]);
		expect(report.ok).toBe(false);
	});

	test("T4 낼 수 있는 규칙 ID 전부가 기대 표나 가드 시험에 나온다", async () => {
		const config = await extractDepcruiseConfig(configPath);
		const possible = new Set([
			...(config.forbidden ?? []).flatMap((rule) =>
				rule.name === undefined ? [] : [rule.name],
			),
			...PURITY_RULE_IDS,
			...CQRS_RULE_IDS,
			"B5-module-cycle",
			...GUARD_IDS,
		]);
		const exercised = new Set([
			...EXPECTED_VIOLATING.map(ruleOf),
			...GUARD_IDS,
		]);
		// 픽스처 없는 규칙이 생기면(또는 기대 표에 없는 규칙을 시험이 가정하면) 여기서 빨강이 된다.
		expect(sorted([...possible])).toEqual(sorted([...exercised]));
	});
});

describe("비공허성 가드 순수 함수", () => {
	test("T5 열거가 비면 GUARD-empty", () => {
		expect(findUncruised([], new Set()).map((v) => v.rule)).toEqual([
			"GUARD-empty",
		]);
	});

	test("T5 열거됐지만 결과에 없는 파일은 GUARD-uncruised 에 경로가 담긴다", () => {
		const violations = findUncruised(
			["scripts/a.ts", "scripts/b.ts"],
			new Set(["scripts/a.ts"]),
		);
		expect(violations.map(label)).toEqual(["GUARD-uncruised scripts/b.ts"]);
	});

	test("T5 열거가 전부 결과에 있으면 위반 0", () => {
		expect(
			findUncruised(["scripts/a.ts"], new Set(["scripts/a.ts", "x.ts"])),
		).toEqual([]);
	});
});

describe("B5 패키지 순환 순수 함수", () => {
	test("T6 중첩 폴더를 지나는 패키지 순환을 잡는다(파일 순환은 없다)", () => {
		const violations = findPackageCycles([
			{ from: "packages/a/src/x.ts", to: "packages/b/src/index.ts" },
			{ from: "packages/b/src/index.ts", to: "packages/a/src/sub/y.ts" },
		]);
		expect(violations.map(label)).toEqual(["B5-module-cycle packages/a"]);
	});

	test("T6 패키지 안 파일 순환과 접히지 않는 경로는 무시한다", () => {
		expect(
			findPackageCycles([
				{ from: "packages/a/src/x.ts", to: "packages/a/src/y.ts" },
				{ from: "packages/a/src/y.ts", to: "packages/a/src/x.ts" },
				{ from: "scripts/arch.ts", to: "packages/a/src/x.ts" },
				{ from: "packages/a/src/x.ts", to: "scripts/arch.ts" },
			]),
		).toEqual([]);
	});

	test("T6 순환이 둘이면 각각 한 건, 같은 순환에 속한 셋은 한 건", () => {
		const violations = findPackageCycles([
			{ from: "packages/a/src/x.ts", to: "modules/m/src/x.ts" },
			{ from: "modules/m/src/x.ts", to: "apps/z/src/x.ts" },
			{ from: "apps/z/src/x.ts", to: "packages/a/src/x.ts" },
			{ from: "packages/p/src/x.ts", to: "packages/q/src/x.ts" },
			{ from: "packages/q/src/x.ts", to: "packages/p/src/x.ts" },
		]);
		expect(violations.map((v) => v.from).sort()).toEqual([
			"apps/z",
			"packages/p",
		]);
	});
});

describe("실저장소", () => {
	test("T7 가드 위반이 0 이고 알려진 파일은 열거되며 픽스처는 열거되지 않는다", async () => {
		// 제품 위반 여부는 여기서 단언하지 않는다 — 그건 `bun run arch` 의 몫이다.
		const report = await runArch(repoRoot);
		expect(
			report.violations.filter((v) => v.rule.startsWith("GUARD-")),
		).toEqual([]);
		expect(report.enumeratedFiles).toContain("scripts/arch.ts");
		expect(report.enumeratedFiles).toContain("scripts/check-license.test.ts");
		expect(
			report.enumeratedFiles.filter((p) => p.startsWith("scripts/fixtures/")),
		).toEqual([]);
	});
});

describe("TypeScript 트랜스파일러 카나리", () => {
	test("T8 TS 7.0.x 에서 dependency-cruiser 의 typescript 트랜스파일러는 쓸 수 없다 — 깨지면 swc 가 아직 필요한지 재검토한다", () => {
		// TS 7.0.x 는 JS API 가 없어 typescript 트랜스파일러가 꺼지고, .ts 를 읽는 길은 swc 하나다.
		// swc 가 없으면 cruise 는 0 모듈로 끝나고 종료 0 이다(조용한 0건) — 비공허성 가드가 그것을 막는다.
		// TS 7.1 이 API 를 되살려 이 값이 true 로 뒤집히면 swc 를 계속 둘지 재검토한다(KB #5 재검토 조건).
		const available = (name: string) =>
			getAvailableTranspilers().find((t) => t.name === name)?.available;
		expect(available("typescript")).toBe(false);
		expect(available("swc")).toBe(true);
	});
});
