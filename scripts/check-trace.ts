// 추적표 점검 — docs/traceability.md 와 명세의 AC 헤딩·시험 소스의 이름이 어긋나지 않는지 본다(AC-032, ADR-050).
// 판정(checkTrace)은 파일을 읽지 않는 순수 함수이고, 입력을 모으는 일은 loadInput 이 한다(check-cqrs.ts·arch.ts 와 같은 분리).
//
// 판정은 junit 실행이 아니라 소스 문자열이다. 그래서 `test(`·`it(`·`describe(` 의 첫 인자가 문자열 리터럴일 때만 이름을 본다 —
// 템플릿 보간·변수로 만든 동적 이름은 보지 못한다(한계). 시험 칸의 이름도 소스에 그 문자열이 있는지만 확인한다.
// 이 스크립트의 시험 파일은 `AC-` 로 시작하는 이름의 호출을 문자열로 지어 넣으므로, 호출 표기를 리터럴로 적지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type TraceViolation = {
	readonly rule: string;
	/** 위반이 난 자리 — AC 번호 또는 시험 파일 경로. */
	readonly where: string;
	readonly detail?: string;
};

export type TraceInput = {
	/** docs/traceability.md 전문. */
	readonly traceText: string;
	/** specs/portfolio-site.spec.md 전문. */
	readonly specText: string;
	/** 시험 파일 경로(검사 루트 기준, `/` 구분) → 소스. 규칙 4 의 대상이다. */
	readonly testSources: ReadonlyMap<string, string>;
	/** 추적표 시험 칸이 가리키는 파일의 소스. 파일이 없으면 undefined. */
	readonly readSource: (path: string) => string | undefined;
};

type TraceRow = {
	readonly ac: string;
	readonly testCell: string;
	readonly status: string;
};

const SPEC_AC = /^### (AC-\d{3}):/gm;
const ROW_START = /^\| (AC-\d{3}) \|/;
const COLUMN_COUNT = 6;
const NO_TEST = "—";
// 시험 칸 한 항목: `경로` — 이름(이름은 백틱으로 감싸도 된다).
const TEST_ENTRY = /^`([^`]+)`\s*—\s*(.+)$/;
// 첫 인자가 문자열 리터럴이고 AC 번호로 시작하는 시험 호출.
const AC_TEST_CALL = /\b(?:test|it|describe)(?:\.\w+)*\(\s*(["'`])(AC-\d{3})/g;

function specAcs(specText: string): Set<string> {
	return new Set([...specText.matchAll(SPEC_AC)].map((m) => m[1] ?? ""));
}

function parseRows(
	traceText: string,
	violations: TraceViolation[],
): TraceRow[] {
	const rows: TraceRow[] = [];
	for (const line of traceText.split("\n")) {
		const start = ROW_START.exec(line);
		if (start === null) {
			continue;
		}
		const ac = start[1] ?? "";
		const cells = line
			.trim()
			.slice(1, -1)
			.split("|")
			.map((cell) => cell.trim());
		if (cells.length !== COLUMN_COUNT) {
			violations.push({
				rule: "TRACE-row-format",
				where: ac,
				detail: `열이 ${COLUMN_COUNT}개여야 한다(실제 ${cells.length})`,
			});
			continue;
		}
		rows.push({ ac, testCell: cells[3] ?? "", status: cells[5] ?? "" });
	}
	return rows;
}

/** 시험 칸을 `{경로, 이름}` 목록으로 푼다. 항목은 `<br>` 로 나눈다. 형식이 틀린 항목은 undefined. */
function parseTestCell(
	cell: string,
): Array<{ path: string; name: string } | undefined> {
	return cell.split(/<br\s*\/?>/).map((entry) => {
		const match = TEST_ENTRY.exec(entry.trim());
		if (match === null) {
			return undefined;
		}
		return {
			path: match[1] ?? "",
			name: (match[2] ?? "").trim().replace(/^`|`$/g, ""),
		};
	});
}

function checkRowTests(
	row: TraceRow,
	readSource: TraceInput["readSource"],
	violations: TraceViolation[],
): void {
	if (row.testCell === NO_TEST) {
		if (row.status === "검증") {
			violations.push({
				rule: "TRACE-verified-without-test",
				where: row.ac,
				detail: "상태가 검증인데 시험 칸이 비었다",
			});
		}
		return;
	}
	for (const entry of parseTestCell(row.testCell)) {
		if (entry === undefined) {
			violations.push({
				rule: "TRACE-test-cell-format",
				where: row.ac,
				detail: "시험 칸 항목은 `경로` — 이름 형식이어야 한다",
			});
			continue;
		}
		const source = readSource(entry.path);
		if (source === undefined) {
			violations.push({
				rule: "TRACE-test-file-missing",
				where: row.ac,
				detail: entry.path,
			});
		} else if (!source.includes(entry.name)) {
			violations.push({
				rule: "TRACE-test-name-missing",
				where: row.ac,
				detail: `${entry.path} 에 "${entry.name}" 이(가) 없다`,
			});
		}
	}
}

export function checkTrace(input: TraceInput): TraceViolation[] {
	const violations: TraceViolation[] = [];
	const spec = specAcs(input.specText);
	const rows = parseRows(input.traceText, violations);
	const traced = new Set(rows.map((row) => row.ac));

	// 규칙 1 — 추적표와 명세의 AC 집합이 양방향으로 같다.
	for (const ac of traced) {
		if (!spec.has(ac)) {
			violations.push({ rule: "TRACE-ac-not-in-spec", where: ac });
		}
	}
	for (const ac of spec) {
		if (!traced.has(ac)) {
			violations.push({ rule: "TRACE-ac-not-in-trace", where: ac });
		}
	}

	// 규칙 2·3 — 행마다 시험 칸을 본다.
	for (const row of rows) {
		checkRowTests(row, input.readSource, violations);
	}

	// 규칙 4 — 시험 이름이 가리키는 AC 가 명세에 있다.
	for (const [path, source] of input.testSources) {
		for (const match of source.matchAll(AC_TEST_CALL)) {
			const ac = match[2] ?? "";
			if (!spec.has(ac)) {
				violations.push({
					rule: "TRACE-test-unknown-ac",
					where: path,
					detail: `${ac} 는 명세에 없다`,
				});
			}
		}
	}
	return violations;
}

const SCAN_GLOBS = [
	"apps/**/test/**/*.test.ts",
	"modules/**/test/**/*.test.ts",
	"packages/**/test/**/*.test.ts",
	"test/**/*.test.ts",
	"scripts/*.test.ts",
];

function isScannable(path: string): boolean {
	return !path.includes("node_modules/") && !path.includes("/fixtures/");
}

/** 저장소 루트에서 추적표·명세·시험 소스를 모은다. 루트 하위 5곳만 훑는다(node_modules 를 걷지 않는다). */
export function loadInput(root: string): TraceInput {
	const testSources = new Map<string, string>();
	for (const pattern of SCAN_GLOBS) {
		for (const found of new Bun.Glob(pattern).scanSync({ cwd: root })) {
			const path = found.replaceAll("\\", "/");
			if (isScannable(path)) {
				testSources.set(path, readFileSync(`${root}/${path}`, "utf8"));
			}
		}
	}
	return {
		traceText: readFileSync(`${root}/docs/traceability.md`, "utf8"),
		specText: readFileSync(`${root}/specs/portfolio-site.spec.md`, "utf8"),
		testSources,
		readSource: (path) => {
			const full = `${root}/${path}`;
			return existsSync(full) ? readFileSync(full, "utf8") : undefined;
		},
	};
}

export function formatViolation(v: TraceViolation): string {
	return v.detail === undefined
		? `${v.rule} ${v.where}`
		: `${v.rule} ${v.where} (${v.detail})`;
}

if (import.meta.main) {
	const root = (
		process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url))
	).replace(/[\\/]$/, "");
	const input = loadInput(root);
	const violations = checkTrace(input);
	for (const violation of violations) {
		console.log(formatViolation(violation));
	}
	console.log(
		`check:trace: 시험 파일 ${input.testSources.size} · 위반 ${violations.length}`,
	);
	process.exitCode = violations.length === 0 ? 0 : 1;
}
