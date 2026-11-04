// WCAG 2.2 대비 계산기 — ../tokens.css 를 읽어 라이트/다크 토큰 쌍의 대비비를 표로 낸다.
// 사용: bun docs/design/ui/tools/contrast.mjs [--md]   (실패가 있으면 종료 코드 1)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8");

function blockVars(src) {
  const vars = {};
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}
// 1) @theme  2) 첫 번째 :root {…}  3) :root[data-theme="dark"] {…}
const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)[1];
const rootBlock = css.match(/\n:root\s*\{([\s\S]*?)\n\}/)[1];
const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
const light = { ...blockVars(themeBlock), ...blockVars(rootBlock) };
const dark = { ...light, ...blockVars(darkBlock) };

function resolve(vars, name, depth = 0) {
  let v = vars[name];
  if (v === undefined) throw new Error("토큰 없음: " + name);
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref && depth < 5) return resolve(vars, ref[1], depth + 1);
  return v;
}
function lum(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const T = 4.5, G = 3.0; // 텍스트 / 비텍스트(UI·그래픽)
const pairs = [
  // 본문·보조 텍스트
  ["본문", "--color-text", "--color-bg", T], ["본문", "--color-text", "--color-surface", T], ["본문", "--color-text", "--color-surface-sunken", T],
  ["보조 텍스트", "--color-muted", "--color-bg", T], ["보조 텍스트", "--color-muted", "--color-surface", T], ["보조 텍스트", "--color-muted", "--color-surface-sunken", T],
  ["캡션(subtle)", "--color-subtle", "--color-bg", T], ["캡션(subtle)", "--color-subtle", "--color-surface", T], ["캡션(subtle)", "--color-subtle", "--color-surface-sunken", T],
  // 링크
  ["링크", "--color-accent", "--color-bg", T], ["링크", "--color-accent", "--color-surface", T], ["링크", "--color-accent", "--color-surface-sunken", T], ["링크 hover", "--color-accent-hover", "--color-bg", T],
  // 버튼
  ["주 버튼 글자", "--color-primary-fg", "--color-primary", T], ["주 버튼 hover", "--color-primary-fg", "--color-primary-hover", T],
  ["강조 버튼 글자", "--color-accent-fg", "--color-accent", T], ["강조 버튼 hover", "--color-accent-fg", "--color-accent-hover", T],
  // 선택·배지
  ["선택 칩(accent/subtle)", "--color-accent", "--color-accent-subtle", T], ["선택 칩 본문", "--color-text", "--color-accent-subtle", T],
  ["배지 success", "--color-success", "--color-success-subtle", T], ["배지 warn", "--color-warn", "--color-warn-subtle", T],
  ["배지 danger", "--color-danger", "--color-danger-subtle", T], ["배지 info", "--color-info", "--color-info-subtle", T],
  ["의미색 글자 success", "--color-success", "--color-surface", T], ["의미색 글자 warn", "--color-warn", "--color-surface", T], ["의미색 글자 danger", "--color-danger", "--color-surface", T],
  // 색조 배경(알림·배너) 위의 중립 텍스트
  ...["warn", "danger", "success", "info"].flatMap((k) => [
    [`본문 on ${k}-subtle`, "--color-text", `--color-${k}-subtle`, T],
    [`보조 on ${k}-subtle`, "--color-muted", `--color-${k}-subtle`, T],
    [`캡션 on ${k}-subtle`, "--color-subtle", `--color-${k}-subtle`, T],
  ]),
  // 비텍스트
  ["입력 테두리", "--color-border-strong", "--color-bg", G], ["입력 테두리", "--color-border-strong", "--color-surface", G],
  ["포커스 링", "--color-focus", "--color-bg", G], ["포커스 링", "--color-focus", "--color-surface", G],
  // 흐름 시각화(아이콘·선·막대, 상태 텍스트로도 쓰이므로 텍스트 기준 4.5 도 확인)
  ...["pending", "active", "done", "warn", "error", "dead", "bar"].flatMap((s) => [
    [`흐름 ${s}`, `--flow-${s}`, "--color-surface", T],
    [`흐름 ${s}`, `--flow-${s}`, "--color-surface-sunken", G],
  ]),
];

let failed = 0;
const rows = [];
for (const [label, fg, bg, min] of pairs) {
  const cells = [];
  for (const [name, vars] of [["light", light], ["dark", dark]]) {
    const f = resolve(vars, fg), b = resolve(vars, bg);
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) failed++;
    cells.push({ name, f, b, r, ok });
  }
  rows.push({ label, fg, bg, min, cells });
}
if (process.argv.includes("--md")) {
  console.log("| 용도 | 전경 | 배경 | 기준 | 라이트 | 다크 |\n|---|---|---|---|---|---|");
  for (const r of rows) {
    const c = (x) => `${x.r.toFixed(2)} ${x.ok ? "✓" : "✗"}`;
    console.log(`| ${r.label} | \`${r.fg.replace("--", "")}\` | \`${r.bg.replace("--", "")}\` | ${r.min}:1 | ${c(r.cells[0])} | ${c(r.cells[1])} |`);
  }
  console.log(`\n실패 ${failed}건 / 전체 ${rows.length * 2}건`);
} else {
  for (const r of rows) for (const x of r.cells) if (!x.ok) console.log(`FAIL [${x.name}] ${r.label}: ${r.fg} on ${r.bg} = ${x.r.toFixed(2)} (< ${r.min})  ${x.f} / ${x.b}`);
  console.log(`실패 ${failed}건 / 전체 ${rows.length * 2}건`);
}
process.exit(failed ? 1 : 0);
