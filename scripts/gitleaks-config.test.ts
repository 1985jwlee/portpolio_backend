// .gitleaks.toml 정적 시험(L2, AC-027) — gitleaks 바이너리 없이 설정의 구조와 정규식을 본다.
// 바이너리로 실제 검출하는 시험은 scripts/secret-scan/detection.test.ts 이고 CI `secret-scan` 잡에서만 돈다.
// 합성 비밀은 소스에 리터럴로 남기지 않고 실행 시 조합한다 — 리터럴이 있으면 이 파일이 저장소 이력 검사에 걸린다.
import { describe, expect, test } from "bun:test";

const ROOT = new URL("../", import.meta.url);

type Rule = {
	readonly id: string;
	readonly regex: string;
	readonly keywords: readonly string[];
};

type Allowlist = {
	readonly description: string;
	readonly condition: string;
	readonly regexTarget: string;
	readonly paths: readonly string[];
	readonly regexes: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
		throw new Error("문자열 배열이어야 한다");
	}
	return value;
}

function text(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error("문자열이어야 한다");
	}
	return value;
}

async function load(): Promise<{
	readonly useDefault: unknown;
	readonly rules: Rule[];
	readonly allowlists: Allowlist[];
}> {
	const parsed: unknown = Bun.TOML.parse(
		await Bun.file(new URL(".gitleaks.toml", ROOT)).text(),
	);
	if (!isRecord(parsed)) {
		throw new Error(".gitleaks.toml 의 최상위가 표가 아니다");
	}
	const extend = isRecord(parsed.extend) ? parsed.extend : {};
	const rawRules = Array.isArray(parsed.rules) ? parsed.rules : [];
	const rawAllowlists = Array.isArray(parsed.allowlists)
		? parsed.allowlists
		: [];
	return {
		useDefault: extend.useDefault,
		rules: rawRules.filter(isRecord).map((r) => ({
			id: text(r.id),
			regex: text(r.regex),
			keywords: strings(r.keywords),
		})),
		allowlists: rawAllowlists.filter(isRecord).map((a) => ({
			description: text(a.description),
			condition: text(a.condition),
			regexTarget: text(a.regexTarget),
			paths: strings(a.paths),
			regexes: strings(a.regexes),
		})),
	};
}

async function linesOf(path: string): Promise<string[]> {
	return (await Bun.file(new URL(path, ROOT)).text()).split("\n");
}

describe(".gitleaks.toml — 구조", () => {
	test("기본 규칙을 확장한다", async () => {
		expect((await load()).useDefault).toBe(true);
	});

	test("허용 목록은 모두 경로와 줄 전체 모양을 함께 요구한다", async () => {
		const { allowlists } = await load();
		expect(allowlists.length).toBeGreaterThan(0);
		for (const list of allowlists) {
			// AND 가 아니면 경로 또는 정규식 하나만 맞아도 숨는다.
			expect(list.condition).toBe("AND");
			expect(list.regexTarget).toBe("line");
			expect(list.paths.length).toBeGreaterThan(0);
			expect(list.regexes.length).toBeGreaterThan(0);
			for (const path of list.paths) {
				expect(path.startsWith("^") && path.endsWith("$")).toBe(true);
			}
			// 줄 전체와 같아야 하므로 같은 줄에 다른 비밀을 얹어도 숨지 않는다.
			for (const regex of list.regexes) {
				expect(regex.startsWith("^") && regex.endsWith("$")).toBe(true);
			}
		}
	});
});

describe(".gitleaks.toml — Discord 웹훅 규칙", () => {
	const id = "1".repeat(18);
	const tail = "aB3_-".repeat(13);
	const webhook = (host: string, version = "") =>
		`https://${host}/api${version}/webhooks/${id}/${tail}`;

	test("규칙이 있고 정규식이 웹훅 URL 형식을 잡는다", async () => {
		const rule = (await load()).rules.find(
			(r) => r.id === "discord-webhook-url",
		);
		expect(rule).toBeDefined();
		const pattern = new RegExp(rule?.regex ?? "");
		for (const host of [
			"discord.com",
			"discordapp.com",
			"ptb.discord.com",
			"canary.discord.com",
		]) {
			expect(pattern.test(webhook(host))).toBe(true);
		}
		expect(pattern.test(webhook("discord.com", "/v10"))).toBe(true);
		expect(rule?.keywords).toContain("discord");
	});

	test("웹훅이 아닌 Discord URL·형식이 틀린 값은 잡지 않는다", async () => {
		const rule = (await load()).rules.find(
			(r) => r.id === "discord-webhook-url",
		);
		const pattern = new RegExp(rule?.regex ?? "");
		// 토큰이 짧다 / id 가 숫자가 아니다 / 웹훅 경로가 아니다 / 다른 호스트.
		const shortToken = webhook("discord.com").slice(0, -30);
		const wordId = webhook("discord.com").replace(id, "abcdefghijklmnopqr");
		expect(pattern.test(shortToken)).toBe(false);
		expect(pattern.test(wordId)).toBe(false);
		expect(
			pattern.test("https://discord.com/developers/docs/resources/webhook"),
		).toBe(false);
		expect(pattern.test(webhook("example.com"))).toBe(false);
	});
});

describe(".gitleaks.toml — 허용 목록이 가리키는 줄", () => {
	test("허용 정규식마다 대상 파일에 실제로 일치하는 줄이 있다(죽은 항목 없음)", async () => {
		const { allowlists } = await load();
		for (const list of allowlists) {
			const [path] = list.paths;
			// 경로 정규식 `^\.env\.example$` 에서 이스케이프를 걷어 파일 경로로 쓴다.
			const file = (path ?? "").slice(1, -1).replaceAll("\\", "");
			const lines = await linesOf(file);
			for (const regex of list.regexes) {
				const pattern = new RegExp(regex);
				expect(
					lines.filter((line) => pattern.test(line)).length,
				).toBeGreaterThan(0);
			}
		}
	});

	test("허용 줄에 다른 값을 얹으면 더는 허용되지 않는다", async () => {
		const { allowlists } = await load();
		const body = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
		const appended = `ghp_${body}`;
		for (const list of allowlists) {
			const [path] = list.paths;
			const file = (path ?? "").slice(1, -1).replaceAll("\\", "");
			const lines = await linesOf(file);
			for (const regex of list.regexes) {
				const pattern = new RegExp(regex);
				const hit = lines.find((line) => pattern.test(line));
				expect(hit).toBeDefined();
				expect(pattern.test(`${hit} ${appended}`)).toBe(false);
				expect(pattern.test(`${appended} ${hit}`)).toBe(false);
			}
		}
	});
});
