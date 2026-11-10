// G3 시험. README 의 기준 표와 번호가 같다. 기준을 바꾸려면 README 를 먼저 고치고 커밋한다.
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const PORT = 39600;
const BASE = `http://127.0.0.1:${PORT}`;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const RUNS = Number(args.runs ?? 3);
const only = args.only ? new Set(String(args.only).split(",").map(Number)) : null;
const skip = new Set(String(args.skip ?? "").split(",").filter(Boolean).map(Number));
const want = (id: number) => (!only || only.has(id)) && !skip.has(id);

type R = { id: number; name: string; pass: boolean | "SKIP"; detail?: unknown };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { encoding: "utf8", shell: false });

class Server {
  proc!: ReturnType<typeof spawn>;
  stderr = "";
  exit: { code: number | null; signal: string | null } | null = null;
  start() {
    this.proc = spawn("bun", [".next/standalone/server.js"], {
      env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc.stderr!.on("data", (d) => (this.stderr += d));
    this.proc.on("exit", (code, signal) => (this.exit = { code, signal }));
  }
  async ready() {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${BASE}/healthz`)).ok) return true; } catch {}
      await sleep(200);
    }
    return false;
  }
  async stop() {
    if (this.exit) return;
    this.proc.kill("SIGTERM");
    for (let i = 0; i < 50 && !this.exit; i++) await sleep(200);
    if (!this.exit) this.proc.kill("SIGKILL");
  }
}

const get = (path: string, init: RequestInit = {}) => fetch(BASE + path, { redirect: "manual", ...init });
const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1] ?? null;

async function oneRun(runNo: number): Promise<R[]> {
  const out: R[] = [];
  const add = (id: number, name: string, pass: boolean | "SKIP", detail?: unknown) => out.push({ id, name, pass, detail });

  // 1 빌드
  rmSync(".next", { recursive: true, force: true });
  const t0 = performance.now();
  const b = sh("bun", ["--bun", "next", "build"]);
  const buildText = (b.stdout ?? "") + (b.stderr ?? "");
  const buildSec = (performance.now() - t0) / 1000;
  const files = existsSync(".next/standalone/server.js") && existsSync(".next/static");
  // standalone 은 public/.next/static 을 복사해 줘야 한다(Dockerfile 과 같은 동작)
  if (files) {
    sh("cp", ["-r", "public", ".next/standalone/public"]);
    sh("mkdir", ["-p", ".next/standalone/.next"]);
    sh("cp", ["-r", ".next/static", ".next/standalone/.next/static"]);
  }
  const buildErrs = (buildText.match(/\b(Error|Failed)\b/g) ?? []).length;
  add(1, "bun --bun next build + standalone 산출", b.status === 0 && files && buildErrs === 0, { code: b.status, files, buildErrs, buildSec: +buildSec.toFixed(1) });
  if (!files) return out;

  const srv = new Server();
  srv.start();
  if (!(await srv.ready())) {
    add(2, "서버 기동", false, { stderr: srv.stderr.slice(0, 400) });
    await srv.stop();
    return out;
  }

  try {
    // 2 SSR 로케일
    const ko = await (await get("/ko")).text();
    const en = await (await get("/en")).text();
    add(2, "/ko /en 서버 렌더 + stderr 예외 0", ko.includes("G3 스파이크 한국어 제목") && en.includes("G3 spike English title") && !/Error|TypeError/.test(srv.stderr), { stderr: srv.stderr.slice(0, 300) });

    // 3 협상
    const r1 = await get("/");
    const r2 = await get("/", { headers: { "accept-language": "en" } });
    const l1 = r1.headers.get("location") ?? "", l2 = r2.headers.get("location") ?? "";
    add(3, "/ → /ko, Accept-Language en → /en", [307, 308].includes(r1.status) && l1.endsWith("/ko") && [307, 308].includes(r2.status) && l2.endsWith("/en"), { s1: r1.status, l1, s2: r2.status, l2 });

    // 4 matcher 제외
    const h = await get("/healthz");
    const tm = await get("/api/time");
    const tj = tm.ok ? await tm.json().catch(() => null) : null;
    add(4, "/healthz /api/time 리다이렉트 없이 200", h.status === 200 && !h.headers.get("location") && tm.status === 200 && !tm.headers.get("location") && typeof tj?.now === "number", { h: h.status, t: tm.status });

    // 5 nonce
    const nonces = new Set<string>();
    let missing = 0, cacheHit = 0, sMax = 0;
    for (let i = 0; i < 10; i++) {
      const r = await get("/ko");
      const html = await r.text();
      const n = nonceOf(r.headers.get("content-security-policy"));
      if (n) nonces.add(n);
      const tags = html.match(/<script\b[^>]*>/g) ?? [];
      missing += tags.filter((t) => !t.includes(`nonce="${n}"`)).length;
      if ((r.headers.get("x-nextjs-cache") ?? "") === "HIT") cacheHit++;
      if ((r.headers.get("cache-control") ?? "").includes("s-maxage")) sMax++;
    }
    add(5, "요청별 nonce 10종 + script 누락 0 + 동적 렌더", nonces.size === 10 && missing === 0 && cacheHit === 0 && sMax === 0, { nonces: nonces.size, missing, cacheHit, sMax });

    // 6·7 브라우저
    if (want(6) || want(7)) {
      let chromium: any = null;
      try { chromium = (await import("@playwright/test")).chromium; } catch {}
      if (!chromium) {
        add(6, "하이드레이션", "SKIP", "playwright 없음"); add(7, "style-src-attr", "SKIP", "playwright 없음");
      } else {
        const browser = await chromium.launch();
        const run = async (q: string) => {
          const page = await browser.newPage();
          const csp: string[] = [];
          page.on("console", (m: any) => { if (/Content Security Policy|Refused to/.test(m.text())) csp.push(m.text().slice(0, 160)); });
          await page.goto(`${BASE}/ko${q}`, { waitUntil: "networkidle" });
          for (let i = 0; i < 3; i++) await page.click('[data-testid="inc"]');
          const count = await page.textContent('[data-testid="count"]');
          await page.close();
          return { count, csp };
        };
        try {
          const a = await run("");
          add(6, "하이드레이션: 버튼 3회 → 3, CSP 위반 0", a.count === "3" && a.csp.length === 0, a);
          const c = await run("?csp=no-attr");
          add(7, "style-src-attr 열면 0건, 빼면 ≥ 1건", a.csp.length === 0 && c.csp.length >= 1, { open: a.csp.length, closed: c.csp.length, sample: c.csp[0] });
        } catch (e) {
          add(6, "하이드레이션", false, String(e)); add(7, "style-src-attr", false, String(e));
        }
        await browser.close();
      }
    }

    // 8 이미지
    const orig = statSync("public/sample.png").size;
    const img = await get("/_next/image?url=%2Fsample.png&w=64&q=75", { headers: { accept: "image/webp,image/avif" } });
    const buf = img.ok ? (await img.arrayBuffer()).byteLength : 0;
    const ct = img.headers.get("content-type") ?? "";
    add(8, "next/image 최적화(sharp)", img.status === 200 && /image\/(webp|avif)/.test(ct) && buf > 0 && buf < orig, { status: img.status, ct, buf, orig });

    // 관찰: 부하 후 RSS·평균 응답 (판정 아님)
    if (runNo === 1) {
      const lat: number[] = [];
      const end = Date.now() + 30_000;
      await Promise.all(Array.from({ length: 10 }, async () => {
        while (Date.now() < end) { const s = performance.now(); await (await get("/ko")).text(); lat.push(performance.now() - s); }
      }));
      const rss = sh("ps", ["-o", "rss=", "-p", String(srv.proc.pid)]).stdout.trim();
      add(0, "관찰: 30초 동시 10 부하", "SKIP", { requests: lat.length, meanMs: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1), rssKB: Number(rss) });
    }

    // 9 우아한 종료: 처리 중 요청을 하나 걸고 SIGTERM
    const inflight = get("/ko").then((r) => r.text()).then(() => true).catch(() => false);
    const ts = performance.now();
    srv.proc.kill("SIGTERM");
    while (!srv.exit && performance.now() - ts < 10_000) await sleep(100);
    const ok = await inflight;
    add(9, "SIGTERM 10초 안 종료, 코드 143 또는 0, 처리 중 응답 완료", !!srv.exit && (srv.exit.code === 143 || srv.exit.code === 0 || srv.exit.signal === "SIGTERM") && ok, { exit: srv.exit, sec: +((performance.now() - ts) / 1000).toFixed(1), inflightOk: ok });
  } finally {
    await srv.stop();
  }
  return out;
}

function dockerRun(): R {
  const tag = "g3-spike:test", name = "g3-spike-test";
  const bld = sh("docker", ["build", "-t", tag, "."]);
  if (bld.status !== 0) return { id: 10, name: "Docker", pass: false, detail: (bld.stderr ?? "").slice(-400) };
  sh("docker", ["rm", "-f", name]);
  sh("docker", ["run", "-d", "--name", name, "-p", `127.0.0.1:${PORT + 1}:3000`, tag]);
  let health = "";
  for (let i = 0; i < 30; i++) {
    health = sh("docker", ["inspect", "-f", "{{.State.Health.Status}}", name]).stdout.trim();
    if (health === "healthy") break;
    spawnSync("sleep", ["1"]);
  }
  const code = sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", `http://127.0.0.1:${PORT + 1}/ko`]).stdout.trim();
  const size = Number(sh("docker", ["image", "inspect", "-f", "{{.Size}}", tag]).stdout.trim());
  sh("docker", ["rm", "-f", name]);
  return { id: 10, name: "Docker 이미지 healthy + /ko 200", pass: health === "healthy" && code === "200", detail: { health, code, imageMB: +(size / 1e6).toFixed(0) } };
}

const all: R[][] = [];
for (let i = 1; i <= RUNS; i++) {
  console.error(`== 실행 ${i}/${RUNS}`);
  all.push((await oneRun(i)).filter((r) => r.id === 0 || want(r.id)));
}
const docker = want(10) ? dockerRun() : { id: 10, name: "Docker", pass: "SKIP" as const, detail: "생략" };

const ids = [...new Set(all.flat().filter((r) => r.id > 0).map((r) => r.id))].sort((a, b) => a - b);
const criteria = ids.map((id) => {
  const rs = all.map((run) => run.find((r) => r.id === id)).filter(Boolean) as R[];
  const passes = rs.map((r) => r.pass);
  const pass = passes.every((p) => p === true) ? true : passes.every((p) => p === "SKIP") ? "SKIP" : false;
  return { id, name: rs[0].name, pass, perRun: passes, detail: rs.map((r) => r.detail) };
});
criteria.push({ id: 10, name: docker.name, pass: docker.pass, perRun: [docker.pass], detail: [docker.detail] });
const ran = criteria.filter((c) => c.pass !== "SKIP");
const verdict = ran.length > 0 && ran.every((c) => c.pass === true) ? (RUNS >= 3 && !only ? "PASS" : "PASS(부분)") : "FAIL";
const obs = all.flat().filter((r) => r.id === 0).map((r) => r.detail);

const commit = sh("git", ["rev-parse", "HEAD"]).stdout.trim();
const result = { at: new Date().toISOString(), commit, bun: Bun.version, docker: (sh("docker", ["--version"]).stdout ?? "").trim() || "없음", runs: RUNS, only: args.only ?? null, skip: args.skip ?? null, verdict, criteria, observation: obs };
mkdirSync("results", { recursive: true });
const file = `results/${result.at.replace(/[:.]/g, "-")}-verify.json`;
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ verdict, file, criteria: criteria.map((c) => `${c.id} ${c.pass} ${c.name}`) }, null, 2));
process.exit(verdict === "FAIL" ? 1 : 0);
