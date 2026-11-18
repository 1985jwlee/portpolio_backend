// .env.example 의 키와 스키마 정의의 이름이 어긋나지 않게 지키는 시험(R10).
// 견본 키와 필드 정의가 두 곳에 있어서(이 패키지가 만드는 중복) 시험이 없으면 다음 필드 추가 때 견본이 뒤처진다.
import { describe, expect, test } from "bun:test";
import { baseSchema, fields } from "@pf/config";

// 개발 키 넷은 S1-7 dev 스크립트가 DATABASE_URL 로 매핑한다(docs/design/10-security.md:286).
// 같은 목록이 S1-7 스크립트에도 생기므로 출처를 여기에 적어 둔다.
const devDatabaseKeys = [
	"DATABASE_URL_API",
	"DATABASE_URL_GATEWAY",
	"DATABASE_URL_WORKER",
	"DATABASE_URL_MIGRATOR",
];

const repoRoot = new URL("../../../", import.meta.url);

async function exampleKeys(): Promise<ReadonlySet<string>> {
	const text = await Bun.file(new URL(".env.example", repoRoot)).text();
	const keys = text
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
		.map((line) => line.split("=")[0]?.trim() ?? "");
	return new Set(keys);
}

// DATABASE_URL 은 견본에서 개발 키 넷이 대신한다.
const schemaNames = [
	...Object.keys(baseSchema.fields),
	...Object.keys(fields),
].filter((name) => name !== "DATABASE_URL");

describe(".env.example 일치", () => {
	test("E1 견본의 모든 키는 스키마 이름이거나 개발 매핑 키다", async () => {
		const known = new Set([...schemaNames, ...devDatabaseKeys]);
		const extra = [...(await exampleKeys())].filter((key) => !known.has(key));
		expect(extra).toEqual([]);
	});

	test("E2 스키마 이름(DATABASE_URL 제외)과 개발 매핑 키는 모두 견본에 있다", async () => {
		const keys = await exampleKeys();
		const absent = [...schemaNames, ...devDatabaseKeys].filter(
			(name) => !keys.has(name),
		);
		expect(absent).toEqual([]);
	});
});
