// 경계 검사 그래프 규칙 — S1-5. 규칙의 정본은 docs/design/01-repository-structure.md §5 (규칙 수단 표) 와 이 파일이다.
// 실행은 `bun run arch` 로만 한다(scripts/arch.ts 가 이 설정을 읽어 API 로 한 번 돌린다).
// B3(CQRS)·B5(패키지 순환)·문자열 규칙(B9 env·시간·난수·B11)·비공허성 가드는 여기 없다 — 각각
// scripts/check-cqrs.ts · scripts/arch.ts · scripts/check-purity.ts 가 맡는다.
//
// parser 를 swc 로 두는 이유: TypeScript 7.0.x 에서는 dependency-cruiser 의 기본(tsc) 파서가 .ts 를
// 한 건도 읽지 못하고 종료 0 으로 끝난다(검사가 조용히 빈다). swc 는 TypeScript 를 거치지 않고
// 구문을 직접 읽으므로 두 번째 TypeScript 없이 동작한다. 이 전제는 scripts/arch.test.ts 의 카나리가 잰다.
//
// 모든 경로는 검사 루트(baseDir) 기준 상대 경로다 — 실저장소와 시험 픽스처가 같은 규칙으로 돈다.
// 위반 ID 는 규칙 name 의 접두다(01 §5 의 이유 열로 곧장 간다).

/** 제품 소스 — 계층·순수성·환경·보조 포트 규칙의 범위(시험·픽스처 제외). */
const PRODUCT_SRC = "^(apps|modules|packages)/[^/]+/src/";

/** 구현 모듈(`-contract` 로 끝나지 않는 모듈 디렉토리). */
const IMPL_MODULE = "^modules/(?![^/]+-contract/)[^/]+/";

/** 모듈 공개 진입 — modules/<m>/src/index.ts */
const PUBLIC_INDEX = "index\\.ts$";

/** 스키마 진입 — packages/db 만 임포트할 수 있다. */
const SCHEMA_ENTRY = "adapter/postgres/schema\\.ts$";

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
	forbidden: [
		// B1 계층 방향 — 같은 모듈 안에서만 본다(모듈 사이는 B4·B13 이 본다).
		{
			name: "B1-domain",
			comment: "domain 은 어느 계층도 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/src/domain/" },
			to: { path: "^modules/$1/src/(service|usecase|port|adapter)/" },
		},
		{
			name: "B1-service",
			comment: "service 는 usecase·adapter 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/src/service/" },
			to: { path: "^modules/$1/src/(usecase|adapter)/" },
		},
		{
			name: "B1-port",
			comment: "port 는 usecase·adapter 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/src/port/" },
			to: { path: "^modules/$1/src/(usecase|adapter)/" },
		},
		{
			name: "B1-usecase",
			comment: "usecase 는 adapter 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/src/usecase/" },
			to: { path: "^modules/$1/src/adapter/" },
		},

		// B2 순수성 — domain·service 는 I/O 에 의존하지 않는다. 시간·난수 호출은 check-purity 가 본다.
		{
			name: "B2-core",
			comment: "domain·service 는 내장 모듈(node:*·bun·bun:*·fs·net …)을 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/[^/]+/src/(domain|service)/" },
			to: { dependencyTypes: ["core"] },
		},
		{
			name: "B2-io-package",
			comment: "domain·service 는 packages/db 와 postgres 계열 드라이버를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/[^/]+/src/(domain|service)/" },
			// 해석된 node_modules 경로와 해석 안 된 지정자 둘 다에 걸리게 쓴다.
			to: {
				path: "^packages/db/|(^|/)node_modules/(postgres|pg)(/|$)|^(postgres|pg)$",
			},
		},

		// B4 모듈 공개 API — 모듈 밖에서는 index 만(스키마 진입은 packages/db 만).
		{
			name: "B4-deep-module",
			comment: "다른 모듈은 modules/<m>/src/index.ts 외를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/" },
			to: {
				path: "^modules/[^/]+/src/",
				// 같은 모듈 안(그룹 $1)과 공개 진입은 대상이 아니다.
				pathNot: [`^modules/$1/`, `^modules/[^/]+/src/${PUBLIC_INDEX}`],
			},
		},
		{
			name: "B4-deep-outside",
			comment: "apps·packages·test·scripts 는 모듈의 index.ts 외를 임포트하지 않는다(packages/db 의 스키마 진입은 아래 규칙)",
			severity: "error",
			from: { path: "^(apps|packages|test|scripts)/", pathNot: "^packages/db/" },
			to: {
				path: "^modules/[^/]+/src/",
				pathNot: `^modules/[^/]+/src/${PUBLIC_INDEX}`,
			},
		},
		{
			name: "B4-deep-db",
			comment: "packages/db 는 모듈의 index.ts 와 스키마 진입(adapter/postgres/schema.ts)만 임포트한다",
			severity: "error",
			from: { path: "^packages/db/" },
			to: {
				path: "^modules/[^/]+/src/",
				pathNot: [
					`^modules/[^/]+/src/${PUBLIC_INDEX}`,
					`^modules/[^/]+/src/${SCHEMA_ENTRY}`,
				],
			},
		},

		// B6 조립 위치 — adapter 는 같은 모듈의 adapter 안과 조립에서만 임포트된다.
		// (다른 모듈·apps 에서 adapter 로 가는 간선은 깊은 경로라 B4 가 잡는다.)
		{
			name: "B6-adapter",
			comment: "같은 모듈의 adapter 밖(src)에서 adapter 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/([^/]+)/src/(?!adapter/)" },
			to: { path: "^modules/$1/src/adapter/" },
		},

		// B7 패키지 방향
		{
			name: "B7-packages-up",
			comment: "packages 는 modules·apps 를 임포트하지 않는다(스키마 진입은 B4 가 허용한 유일한 예외)",
			severity: "error",
			from: { path: "^packages/" },
			// B4 가 packages/db 에 허용한 스키마 진입까지 막으면 두 규칙이 서로 모순된다.
			// 다른 패키지가 스키마 진입을 임포트하는 것은 B4-deep-outside 가 잡는다.
			to: {
				path: "^(modules|apps)/",
				pathNot: `^modules/[^/]+/src/${SCHEMA_ENTRY}`,
			},
		},
		{
			name: "B7-modules-up",
			comment: "modules 는 apps 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/" },
			to: { path: "^apps/" },
		},
		{
			name: "B7-kernel",
			comment: "kernel 은 자기 밖의 아무것도(내장·npm 포함) 임포트하지 않는다",
			severity: "error",
			// 시험(packages/kernel/test)은 bun:test 를 임포트하므로 소스만 건다.
			from: { path: "^packages/kernel/src/" },
			to: { pathNot: "^packages/kernel/" },
		},

		// B8 웹 격리
		{
			name: "B8-web",
			comment: "apps/web 은 @pf/protocol 외 서버 코드(modules·packages)를 임포트하지 않는다",
			severity: "error",
			from: { path: "^apps/web/" },
			to: { path: "^(modules|packages)/", pathNot: "^packages/protocol/" },
		},

		// B9 환경 접근 — 문자열 검사(check-purity)가 놓치는 `import { env } from "node:process"` 우회를 막는다.
		{
			name: "B9-process-import",
			comment: "packages/config 밖 제품 소스는 내장 모듈 process 를 임포트하지 않는다",
			severity: "error",
			from: { path: PRODUCT_SRC, pathNot: "^packages/config/" },
			// node:process 는 접두가 벗겨져 `process` 로 찍힌다.
			to: { path: "^process$" },
		},

		// B10 보조 포트 구현 격리
		{
			name: "B10-infra",
			comment: "packages/infra 는 조립(apps/*/src/compose)에서만 임포트한다",
			severity: "error",
			from: {
				path: PRODUCT_SRC,
				pathNot: ["^apps/[^/]+/src/compose/", "^packages/infra/"],
			},
			to: { path: "^packages/infra/" },
		},

		// B13 모듈 계약 패키지 (ADR-052) — import type 도 센다.
		{
			name: "B13-impl-module",
			comment: "모듈은 다른 모듈의 구현이 아니라 -contract 만 임포트한다",
			severity: "error",
			from: { path: "^modules/([^/]+)/" },
			to: { path: IMPL_MODULE, pathNot: "^modules/$1/" },
		},
		{
			name: "B13-impl-app",
			comment: "엔트리포인트의 비조립 코드는 모듈 구현을 임포트하지 않는다",
			severity: "error",
			from: { path: "^apps/[^/]+/", pathNot: "^apps/[^/]+/src/compose/" },
			to: { path: IMPL_MODULE },
		},
		{
			name: "B13-contract",
			comment: "계약 패키지는 @pf/kernel 외 아무것도(내장·npm 포함) 임포트하지 않는다",
			severity: "error",
			// 시험은 bun:test 를 임포트하므로 소스만 건다.
			from: { path: "^modules/([^/]+-contract)/src/" },
			to: { pathNot: ["^packages/kernel/", "^modules/$1/"] },
		},

		// B14 모듈은 identity 를 호출하지 않는다 (ADR-052). 마이그레이션 SQL 절은 S1-18.
		{
			name: "B14-identity",
			comment: "identity 가 아닌 모듈은 identity·identity-contract 를 임포트하지 않는다",
			severity: "error",
			from: { path: "^modules/(?!identity(-contract)?/)[^/]+/" },
			to: { path: "^modules/identity(-contract)?/" },
		},

		// 해석 안 되는 지정자는 위 경로 규칙을 조용히 피한다(예: node_modules 에 없는 @pf/*).
		{
			name: "unresolvable",
			comment: "해석되지 않는 임포트는 경로 규칙을 우회하므로 그 자체로 위반이다",
			severity: "error",
			from: {},
			to: { couldNotResolve: true },
		},
	],
	options: {
		parser: "swc",
		doNotFollow: { path: "node_modules" },
		// 의도적 위반 픽스처 — 실저장소 검사에서만 의미가 있다(픽스처 루트의 경로는 modules/… 로 시작한다).
		exclude: { path: "^scripts/fixtures/" },
		// 패키지 exports 의 하위 경로(예: dependency-cruiser/config-utl/…)를 해석한다. 이 조건 목록이 없으면
		// 하위 경로 임포트가 해석 실패(unresolvable)로 찍힌다 — dependency-cruiser 초기 설정 템플릿의 권장값이다.
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
		},
	},
};
