// AC-032 — 라이선스·콘텐츠 고지 시험 (docs/design/08-test-strategy.md §4).
// 저장소에 추적되는 파일 셋을 읽기만 한다. 쓰기·네트워크·시계·서브프로세스를 쓰지 않는다.
import { describe, expect, test } from "bun:test";

// 이 파일은 <저장소 루트>/scripts/ 에 있으므로 한 단계 위가 저장소 루트다.
const repoRoot = new URL("../", import.meta.url);

/**
 * README 에서 `## 라이선스` 절의 본문을 잘라 낸다.
 * 머리 줄 다음부터 다음 `## ` 머리 직전까지(없으면 파일 끝까지)이고, `###` 는 끝 경계가 아니다.
 * 머리가 없으면 undefined.
 */
function licenseSection(readme: string): string | undefined {
	const lines = readme.split("\n");
	const start = lines.findIndex((line) => line.trimEnd() === "## 라이선스");
	if (start === -1) {
		return undefined;
	}
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith("## "));
	return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("AC-032 라이선스와 콘텐츠 고지", () => {
	test("LICENSE 첫 줄이 MIT License 다", async () => {
		const license = await Bun.file(new URL("LICENSE", repoRoot)).text();
		// 줄바꿈이 CRLF 여도 첫 줄이 같게 읽히도록 앞뒤 공백·\r 을 제거한다.
		expect(license.split("\n")[0]?.trim()).toBe("MIT License");
	});

	test("CONTENT-LICENSE.md 가 있다", async () => {
		expect(
			await Bun.file(new URL("CONTENT-LICENSE.md", repoRoot)).exists(),
		).toBe(true);
	});

	test("README 라이선스 절이 MIT 와 개인 콘텐츠 권리 유보를 고지하고 두 파일을 가리킨다", async () => {
		const readme = await Bun.file(new URL("README.md", repoRoot)).text();
		const section = licenseSection(readme);
		expect(section).toBeDefined();
		// toBeDefined 는 타입을 좁히지 않으므로 분기로 좁힌다. 위에서 실패하므로 여기는 도달하지 않는다.
		if (section === undefined) {
			return;
		}
		for (const required of [
			"](LICENSE)",
			"](CONTENT-LICENSE.md)",
			"MIT",
			"개인 콘텐츠",
			"모든 권리 유보",
		]) {
			expect(section).toContain(required);
		}
	});
});
