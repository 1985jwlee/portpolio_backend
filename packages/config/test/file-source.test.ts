// 실제 파일시스템을 타는 읽기 경로 시험(L3) — FileBackedEnvSource 의 기본 읽기 함수를 그대로 쓴다.
// 임시 디렉토리는 저장소 밖(os.tmpdir)에 만들고 시험이 끝나면 지운다.
// EACCES(권한 없음)는 시험하지 않는다 — root 로 도는 환경에서는 chmod 000 이 막지 못해 시험이 흔들린다.
// 그 분류는 loader.test.ts 의 가짜 읽기(L6)가 본다.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	defineSchema,
	FileBackedEnvSource,
	field,
	loadConfig,
	MapEnvSource,
} from "@pf/config";

const schema = defineSchema({ X: field.string() });
let dir = "";

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "pf-config-file-"));
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

function loadFrom(path: string) {
	return loadConfig(
		schema,
		new FileBackedEnvSource(new MapEnvSource({ X_FILE: path })),
	);
}

describe("실제 파일 읽기", () => {
	test("F1 끝이 CRLF 인 파일은 개행이 지워진 값이 된다", () => {
		const path = join(dir, "crlf");
		writeFileSync(path, "secret-value\r\n");
		const result = loadFrom(path);
		expect(result.ok && result.value.config.X).toBe("secret-value");
	});

	test("F1b 맨 앞 BOM 이 있는 파일도 같은 값이 된다(읽기 방법과 무관)", () => {
		const path = join(dir, "bom");
		writeFileSync(
			path,
			Buffer.concat([
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from("secret-value\r\n"),
			]),
		);
		const result = loadFrom(path);
		expect(result.ok && result.value.config.X).toBe("secret-value");
	});

	test("F2 없는 경로는 file_not_found 이고 경로가 오류에 실리지 않는다", () => {
		const path = join(dir, "missing-file");
		const result = loadFrom(path);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: [],
				invalid: [{ name: "X", reason: "file_not_found" }],
				violations: [],
			});
			expect(JSON.stringify(result.error)).not.toContain(path);
		}
	});

	test("F3 디렉토리 경로는 file_unreadable", () => {
		const path = join(dir, "a-directory");
		mkdirSync(path);
		const result = loadFrom(path);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.details).toEqual({
				missing: [],
				invalid: [{ name: "X", reason: "file_unreadable" }],
				violations: [],
			});
		}
	});
});
