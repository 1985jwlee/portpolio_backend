// S0-2 비교 — 시나리오 × 변형 × 반복을 하나씩 실행하고 README 의 기준으로 판정한다.
// 작성: AI 초안 (Authorship: G).
//
// 사용: bun compare.ts [--scenarios=SA,SB,SC] [--variants=A,B,C,D,E] [--reps=N] [--label=full]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const here = import.meta.dir;
const opt: Record<string, string> = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) opt[m[1]!] = m[2]!; }

type Scen = { public: number; private: number; rate: number; payload: number; duration: number; slow: number; slowAt: number; window: number; variants: string[]; reps: number; capMs: number };
const SCEN: Record<string, Scen> = {
  SA: { public: 900, private: 100, rate: 20, payload: 200, duration: 240, slow: 10, slowAt: 120, window: 30, variants: ["A", "B"], reps: 2, capMs: 100 },
  SB: { public: 90, private: 10, rate: 200, payload: 1000, duration: 150, slow: 10, slowAt: 30, window: 10, variants: ["A", "B", "C", "D", "E"], reps: 3, capMs: 100 },
  SC: { public: 40, private: 10, rate: 2000, payload: 1000, duration: 120, slow: 10, slowAt: 30, window: 10, variants: ["A", "B", "C", "D", "E"], reps: 3, capMs: 250 },
};
const scenarios = (opt.scenarios ?? "SA,SB,SC").split(",");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(here, "results", `${stamp}-${opt.label ?? "full"}`);
mkdirSync(join(outDir, "runs"), { recursive: true });
const PORT = 3150;

const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
const sumVals = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
const slope = (pts: { x: number; y: number }[]) => { const n = pts.length; if (n < 3) return null; const mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n; let num = 0, den = 0; for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; } return den ? num / den : null; };
const readJsonl = (f: string) => readFileSync(f, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const MB = 1048576;

async function runOne(scen: string, v: string, rep: number, attempt: number) {
  const S = SCEN[scen]!;
  const id = `${scen}-${v}-r${rep}${attempt ? `-retry${attempt}` : ""}`;
  const dir = join(outDir, "runs", id);
  mkdirSync(dir, { recursive: true });
  const gwFile = join(dir, "gateway-samples.jsonl"), ldFile = join(dir, "load-windows.jsonl");
  const gw = Bun.spawn(["bun", "gateway.ts"], { cwd: here, stdout: "pipe", stderr: "inherit", env: { ...process.env, VARIANT: v, PORT: String(PORT), PUBLIC_RATE: String(S.rate), PAYLOAD: String(S.payload), SAMPLE_SEC: "5", SAMPLE_FILE: gwFile } });
  const reader = gw.stdout.getReader();
  let buf = "";
  const dec = new TextDecoder();
  for (;;) { const { value, done } = await reader.read(); if (done) throw new Error(`${id}: gateway 가 시작 전에 종료`); buf += dec.decode(value); if (buf.includes("listening")) break; }
  reader.releaseLock();
  const wallStart = Date.now();
  const load = Bun.spawn(["bun", join(here, "..", "g2-ws-soak", "load.ts"), `--url=ws://127.0.0.1:${PORT}`, `--public=${S.public}`, `--private=${S.private}`, `--slow=${S.slow}`, `--slowAt=${S.slowAt}`, `--duration=${S.duration}`, `--window=${S.window}`, `--out=${ldFile}`], { cwd: here, stdout: "ignore", stderr: "inherit" });
  // Bun 은 종료된 프로세스의 CPU 사용량을 주지 않으므로 /proc 을 5초마다 읽는다(유효성: 부하 생성기 CPU)
  const cpuPts: { t: number; ticks: number }[] = [];
  const poll = setInterval(() => {
    try {
      const st = readFileSync(`/proc/${load.pid}/stat`, "utf-8");
      const f = st.slice(st.lastIndexOf(")") + 2).split(" ");
      cpuPts.push({ t: Date.now(), ticks: Number(f[11]) + Number(f[12]) }); // utime + stime (1/100초 단위)
    } catch { /* 종료 직후 */ }
  }, 5000);
  await load.exited;
  clearInterval(poll);
  const wall = (Date.now() - wallStart) / 1000;
  let loadCpu: number | null = null;
  if (cpuPts.length >= 2) { const a = cpuPts[0]!, b = cpuPts[cpuPts.length - 1]!; loadCpu = Number((((b.ticks - a.ticks) / 100) / ((b.t - a.t) / 1000)).toFixed(3)); }
  gw.kill("SIGTERM");
  await Promise.race([gw.exited, new Promise((r) => setTimeout(r, 5000))]);

  const samples = readJsonl(gwFile).filter((r) => r.type === "sample");
  const ld = readJsonl(ldFile);
  const wins = ld.filter((r) => r.type === "window");
  const sum = ld.find((r) => r.type === "summary");
  const inj = ld.find((r) => r.type === "slow-injected");
  const injT: number = inj?.t ?? ld[0].t + S.slowAt * 1000;
  const p99s = wins.filter((w) => w.t >= injT + 10_000 && w.latP99 !== null).map((w) => w.latP99 as number);
  const healthyCloses = sumVals(sum?.total?.closes);
  const serverCloses = sumVals(sum?.serverStats?.closes);
  const before = med(samples.filter((s) => s.t >= injT - 30_000 && s.t < injT).map((s) => s.rss / MB));
  const endRss = med(samples.slice(-3).map((s) => s.rss / MB));
  const third = samples.slice(Math.floor(samples.length * 2 / 3));
  const sl = slope(third.map((s) => ({ x: (s.t - third[0].t) / 60_000, y: s.rss / MB })));
  const killedSample = samples.find((s) => s.t >= injT && sumVals(s.closes) >= S.slow);
  const res = {
    id, scen, variant: v, rep, attempt, wallSec: Number(wall.toFixed(1)),
    loadCpu, gatewayCpuMedian: med(samples.filter((s) => s.t >= injT).map((s) => s.cpuCores)),
    opens: sum?.total?.opens, expectedOpens: S.public + S.private,
    valid: loadCpu !== null && loadCpu < 0.85 && (sum?.total?.opens ?? 0) >= 0.99 * (S.public + S.private),
    healthyP99MedianMs: med(p99s), healthyP99MaxMs: p99s.length ? Math.max(...p99s) : null, windows: p99s.length,
    gaps: sum?.total?.gaps, dups: sum?.total?.dups, reorders: sum?.total?.reorders, healthyCloses, connFail: sum?.total?.connFail ?? 0,
    slowKilled: serverCloses - healthyCloses, closed4408: sum?.serverStats?.closed4408 ?? 0, serverCloseCodes: sum?.serverStats?.closes,
    killedAfterSec: killedSample ? Math.round((killedSample.t - injT) / 1000) : null,
    rssBeforeMb: before && Number(before.toFixed(1)), rssEndMb: endRss && Number(endRss.toFixed(1)), rssGrowthMb: before && endRss ? Number((endRss - before).toFixed(1)) : null, rssLastThirdSlopeMbPerMin: sl === null ? null : Number(sl.toFixed(2)),
    msgsReceived: sum?.total?.msgs,
  };
  writeFileSync(join(dir, "run.json"), JSON.stringify(res, null, 2));
  console.log(`${id.padEnd(14)} valid=${res.valid} p99med=${res.healthyP99MedianMs}ms killed=${res.slowKilled} codes=${JSON.stringify(res.serverCloseCodes)} rssΔ=${res.rssGrowthMb}MB loadCpu=${res.loadCpu} gwCpu=${res.gatewayCpuMedian}`);
  return res;
}

async function main() {
  writeFileSync(join(outDir, "meta.json"), JSON.stringify({ startedAt: new Date().toISOString(), args: opt, host: { bun: Bun.version, cpuModel: os.cpus()[0]?.model, cpus: os.cpus().length, release: os.release(), loadavgAtStart: os.loadavg() }, scenarios: SCEN }, null, 2));
  const all: Awaited<ReturnType<typeof runOne>>[] = [];
  for (const scen of scenarios) {
    const S = SCEN[scen]!;
    const variants = (opt.variants ?? S.variants.join(",")).split(",").filter((v) => S.variants.includes(v));
    const reps = Number(opt.reps ?? S.reps);
    for (const v of variants) for (let rep = 0; rep < reps; rep++) {
      let r = await runOne(scen, v, rep, 0);
      if (!r.valid) { console.log(`  → 무효(부하 생성기 CPU 또는 접속 부족): 한 번 다시`); r = await runOne(scen, v, rep, 1); }
      all.push(r);
    }
  }
  // 판정
  const rows: Record<string, unknown>[] = [];
  const verdict: Record<string, Record<string, { k1: boolean | null; k2: boolean; k3: boolean | null; k4: boolean | null; k5: string; p99: number | null; ratio: number | null; valid: boolean }>> = {};
  for (const scen of scenarios) {
    const S = SCEN[scen]!;
    verdict[scen] = {};
    const base = all.filter((r) => r.scen === scen && r.variant === "A" && r.valid);
    const baseP99 = med(base.map((r) => r.healthyP99MedianMs ?? 0));
    for (const v of S.variants) {
      const runs = all.filter((r) => r.scen === scen && r.variant === v);
      if (!runs.length) continue;
      const validRuns = runs.filter((r) => r.valid);
      const allValid = validRuns.length === runs.length;
      const p99 = med(validRuns.map((r) => r.healthyP99MedianMs ?? 0));
      const ratio = p99 !== null && baseP99 !== null ? Number((p99 / Math.max(baseP99, 1)).toFixed(2)) : null;
      const k1 = scen === "SA" ? null : validRuns.every((r) => r.slowKilled >= S.slow);
      const k2 = validRuns.every((r) => r.gaps === 0 && r.dups === 0 && r.reorders === 0 && r.healthyCloses === 0 && r.connFail === 0);
      const k3 = p99 === null || ratio === null ? null : ratio <= 1.5 && p99 <= S.capMs;
      const k4 = scen === "SA" ? null : validRuns.every((r) => r.rssGrowthMb !== null && r.rssGrowthMb <= 30 && (r.rssLastThirdSlopeMbPerMin ?? 0) <= 5);
      const codes = [...new Set(validRuns.flatMap((r) => Object.keys(r.serverCloseCodes ?? {})))].join("/");
      verdict[scen]![v] = { k1, k2, k3, k4, k5: codes, p99, ratio, valid: allValid };
      rows.push({ scen, variant: v, validRuns: `${validRuns.length}/${runs.length}`, p99MedianMs: p99, ratioToA: ratio, K1: k1, K2: k2, K3: k3, K4: k4, K5_codes: codes });
    }
  }
  const pass = (x: { k1: boolean | null; k2: boolean; k3: boolean | null; k4: boolean | null; valid: boolean } | undefined) => !!x && x.valid && x.k1 !== false && x.k2 && x.k3 === true && x.k4 !== false;
  const baselineOk = scenarios.every((s) => pass(verdict[s]?.A));
  const q1 = scenarios.some((s) => verdict[s]?.B) ? scenarios.every((s) => verdict[s]?.B === undefined || pass(verdict[s]!.B)) : null;
  const q2 = Object.fromEntries(["C", "D", "E"].map((v) => { const ss = scenarios.filter((s) => verdict[s]?.[v]); return [v, ss.length ? ss.every((s) => pass(verdict[s]![v])) : null]; })); // null = 실행하지 않음
  const summary = { baselineAPasses: baselineOk, Q1_elysiaWithAppQueueUsable: q1, Q2_nativeOptionsCanReplaceAppQueue: q2, table: rows };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ summary, runs: all }, null, 2));
  console.table(rows);
  console.log("기준선 A 통과:", baselineOk, "| Q1(Elysia+앱 큐 사용 가능):", q1, "| Q2(네이티브 옵션이 앱 큐 대체):", JSON.stringify(q2));
  console.log("저장:", outDir);
}
await main();
process.exit(0);
