// 정적 목업 빌더 — 토큰·공통 CSS/JS·스프라이트를 각 페이지에 인라인해 외부 요청 0건의 단일 HTML 을 만든다.
// 사용: bun docs/design/ui/build-mockups.ts   (결과: docs/design/ui/*.html)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dir = import.meta.dir;
const read = (p: string) => readFileSync(`${dir}/${p}`, "utf8");
const opt = (p: string) => (existsSync(`${dir}/${p}`) ? read(p) : "");

const tokens = read("tokens.css").replace(/^@theme \{/m, ":root {");
const baseCss = read("src/base.css");
const baseJs = read("src/base.js");
const sprite = read("src/sprite.html");

type Page = { file: string; title: string; nav?: string };
const PAGES: Page[] = [
  { file: "home", title: "홈", nav: "home" },
  { file: "about", title: "자기소개", nav: "about" },
  { file: "guestbook", title: "방명록", nav: "guestbook" },
  { file: "flow", title: "이벤트 흐름", nav: "flow" },
  { file: "architecture", title: "아키텍처", nav: "architecture" },
  { file: "ops", title: "운영 지표", nav: "ops" },
  { file: "admin-reports", title: "관리자 · 신고 큐" },
  { file: "error-404", title: "페이지를 찾을 수 없음" },
  { file: "maintenance", title: "점검 · 쓰기 잠금" },
  { file: "index", title: "목업 목차" },
];
const NAV: [string, string, string][] = [
  ["home", "홈", "home.html"],
  ["about", "자기소개", "about.html"],
  ["guestbook", "방명록", "guestbook.html"],
  ["flow", "흐름", "flow.html"],
  ["architecture", "아키텍처", "architecture.html"],
  ["ops", "지표", "ops.html"],
];

const node = (sym: string, cls: string) => `<svg class="node ${cls}" aria-hidden="true"><use href="#${sym}"/></svg>`;

function header(active?: string) {
  const links = NAV.map(([k, label, href]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const mlinks = NAV.map(([, label, href]) => `<a href="${href}">${label}</a>`).join("");
  return `<header class="site-header"><div class="wrap">
  <a class="brand" href="home.html" aria-label="Backend Portfolio, 홈"><svg viewBox="0 0 28 14" aria-hidden="true"><use href="#logo"/></svg><span class="brand-text">Backend Portfolio</span></a>
  <nav class="nav" aria-label="주 메뉴">${links}</nav>
  <div class="header-tools">
    <span class="conn" data-conn-badge role="status" aria-live="polite"></span>
    <div class="seg hide-sm" role="group" aria-label="언어"><button type="button" data-lang aria-pressed="true" lang="ko">KO</button><button type="button" data-lang aria-pressed="false" lang="en">EN</button></div>
    <button class="btn btn-ghost btn-icon" type="button" data-theme-toggle aria-pressed="false" aria-label="다크 테마로 전환"></button>
    <a class="btn btn-secondary hide-sm" href="#">${node("i-branch", "")}GitHub로 로그인</a>
    <button class="btn btn-ghost btn-icon menu-btn" type="button" data-menu aria-expanded="false" aria-controls="mobile-nav" aria-label="메뉴 열기"><svg class="node" aria-hidden="true"><use href="#i-menu"/></svg></button>
  </div></div></header>
  <div class="mobile-nav" id="mobile-nav" data-open="false">${mlinks}
    <div class="row" style="padding-top:.75rem"><div class="seg" role="group" aria-label="언어"><button type="button" data-lang aria-pressed="true" lang="ko">KO</button><button type="button" data-lang aria-pressed="false" lang="en">EN</button></div><a class="btn btn-secondary" href="#">GitHub로 로그인</a></div></div>`;
}

const footer = `<footer class="site-footer"><div class="wrap">
  <div class="stack" style="--stack:.5rem"><div>코드는 MIT, 자기소개·사진·글 같은 콘텐츠는 저작권 유보입니다.</div><div class="row"><a href="#">GitHub 저장소</a><span class="ci-badge" title="구현에서는 CI 상태 배지 이미지(외부 요청 1건, CSP img-src 허용)">CI 상태 배지 자리</span></div></div>
  <div class="stack" style="--stack:.5rem"><a href="#">개인정보·쿠키 안내</a><div class="xs subtle">이 화면은 정적 목업입니다. 데이터는 예시입니다.</div></div>
</div></footer>`;

for (const p of PAGES) {
  const body = read(`src/pages/${p.file}.html`);
  const css = opt(`src/pages/${p.file}.css`);
  const js = opt(`src/pages/${p.file}.js`);
  const html = `<!doctype html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${p.title} · Backend Portfolio — 목업</title>
<script>(function(){try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){}})()</script>
<style>
${tokens}
${baseCss}
${css}
</style>
</head>
<body>
${sprite}
<a class="skip" href="#main">본문으로 건너뛰기</a>
${header(p.nav)}
<main id="main">
${body}
</main>
${footer}
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script>
${baseJs}
</script>
${js ? `<script>\n${js}\n</script>` : ""}
</body>
</html>
`;
  writeFileSync(`${dir}/${p.file}.html`, html);
  console.log(`${p.file}.html  ${(html.length / 1024).toFixed(1)} KB`);
}
