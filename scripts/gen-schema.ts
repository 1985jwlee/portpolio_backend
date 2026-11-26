// protocol 스키마 → JSON Schema 내보내기. 등록된 스키마마다 packages/protocol/schema/<이름>.json 을 결정적으로 쓴다.
// `--check` 는 파일을 쓰지 않고, 커밋된 파일과 다르거나·없거나·남는 것을 목록으로 보여 종료 1 로 끝낸다(스키마 변경이 리뷰에 보이게 한다).
// 판정(renderSchemas·diffSchemas)은 파일을 읽지 않는 순수 함수이고, 입출력은 아래 실행부만 한다.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ProtocolRegistry } from "@pf/protocol";
import { protocolRegistry } from "@pf/protocol";

export type SchemaDiff = {
	/** 있어야 하는데 없는 파일. */
	readonly missing: readonly string[];
	/** 있지만 내용이 다른 파일. */
	readonly changed: readonly string[];
	/** 등록되지 않았는데 남아 있는 파일. */
	readonly stale: readonly string[];
};

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (typeof value === "object" && value !== null) {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = sortKeys(Reflect.get(value, key));
		}
		return sorted;
	}
	return value;
}

/** 키 정렬·끝 개행으로 직렬화한다. TypeBox 의 Symbol 키(`Kind` 등)는 JSON 에 실리지 않는다. */
export function serializeSchema(schema: unknown): string {
	return `${JSON.stringify(sortKeys(JSON.parse(JSON.stringify(schema))), null, "\t")}\n`;
}

/** 등록된 스키마 전체를 `파일명 → 내용` 으로 만든다. */
export function renderSchemas(
	registry: ProtocolRegistry,
): ReadonlyMap<string, string> {
	const files = new Map<string, string>();
	for (const [name, schema] of registry.entries()) {
		files.set(`${name}.json`, serializeSchema(schema));
	}
	return files;
}

export function diffSchemas(
	expected: ReadonlyMap<string, string>,
	actual: ReadonlyMap<string, string>,
): SchemaDiff {
	const missing: string[] = [];
	const changed: string[] = [];
	for (const [file, content] of expected) {
		const found = actual.get(file);
		if (found === undefined) {
			missing.push(file);
		} else if (found !== content) {
			changed.push(file);
		}
	}
	const stale = [...actual.keys()].filter((file) => !expected.has(file));
	return {
		missing: missing.sort(),
		changed: changed.sort(),
		stale: stale.sort(),
	};
}

export function isClean(diff: SchemaDiff): boolean {
	return (
		diff.missing.length === 0 &&
		diff.changed.length === 0 &&
		diff.stale.length === 0
	);
}

async function readSchemaDir(dir: string): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	let names: string[];
	try {
		names = await readdir(dir);
	} catch (error) {
		if (Reflect.get(error as object, "code") === "ENOENT") {
			return files;
		}
		throw error;
	}
	for (const name of names.filter((n) => n.endsWith(".json"))) {
		files.set(name, await readFile(`${dir}/${name}`, "utf8"));
	}
	return files;
}

function printDiff(diff: SchemaDiff): void {
	for (const file of diff.missing) {
		console.log(`없음 ${file}`);
	}
	for (const file of diff.changed) {
		console.log(`다름 ${file}`);
	}
	for (const file of diff.stale) {
		console.log(`남음 ${file}`);
	}
}

if (import.meta.main) {
	const repoRoot = fileURLToPath(new URL("../", import.meta.url));
	const dir = `${repoRoot}packages/protocol/schema`;
	const expected = renderSchemas(protocolRegistry);
	const diff = diffSchemas(expected, await readSchemaDir(dir));

	if (process.argv.includes("--check")) {
		printDiff(diff);
		console.log(
			`gen:schema --check: 스키마 ${expected.size} · 없음 ${diff.missing.length} · 다름 ${diff.changed.length} · 남음 ${diff.stale.length}`,
		);
		process.exitCode = isClean(diff) ? 0 : 1;
	} else {
		await mkdir(dir, { recursive: true });
		for (const [file, content] of expected) {
			await writeFile(`${dir}/${file}`, content);
		}
		for (const file of diff.stale) {
			await rm(`${dir}/${file}`);
		}
		console.log(
			`gen:schema: 스키마 ${expected.size} 기록 · 정리 ${diff.stale.length}`,
		);
	}
}
