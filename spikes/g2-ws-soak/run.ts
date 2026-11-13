// G2 스파이크 — 게이트웨이와 부하 생성기를 띄우고 끝나면 분석한다.
// 작성: AI 초안 (Authorship: G).
//
// 사용: bun run.ts [--duration=14400] [--public=900] [--private=100] [--slow=10] [--slowAt=1800] [--label=soak4h]
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const opt: Record<string, string> = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) opt[m[1]!] = m[2]!; }
const num = (k: string, d: number) => (opt[k] !== undefined ? Number(opt[k]) : d);
const params = { stormAt: (opt.stormAt ?? "60,150").split(",").map(Number), duration: num("duration", 14400), public: num("public", 900), private: num("private", 100), slow: num("slow", 10), slowAt: num("slowAt", 1800), publicRate: num("publicRate", 20), payload: num("payload", 200), port: num("port", 3100), storm: num("storm", 0), window: num("window", 60), churnRate: num("churnRate", 0), churnAt: num("churnAt", 120), churnSec: num("churnSec", 1200) };
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const run = `${stamp}-${opt.label ?? "run"}`;
const dir = join(import.meta.dir, "results", run);
mkdirSync(dir, { recursive: true });

const git = (args: string[]) => { try { const r = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir }); return r.exitCode === 0 ? r.stdout.toString().trim() : null; } catch { return null; } };
writeFileSync(join(dir, "meta.json"), JSON.stringify({
  run, startedAt: new Date().toISOString(), params,
  host: { bun: Bun.version, platform: process.platform, release: os.release(), cpuModel: os.cpus()[0]?.model, cpus: os.cpus().length, totalMem: os.totalmem(), loadavgAtStart: os.loadavg() },
  commit: git(["rev-parse", "HEAD"]), dirty: (git(["status", "--porcelain", "--", "."]) ?? "").replace(/results\/[^\n]*\n?/g, "").length > 0,
}, null, 2));

function spawnGateway() {
  return Bun.spawn(["bun", "gateway.ts"], {
    cwd: import.meta.dir, stdout: "pipe", stderr: "inherit",
    env: { ...(params.churnRate > 0 ? { GC_SEC: "60", SAMPLE_SEC: "5" } : {}), ...process.env, PORT: String(params.port), PUBLIC_RATE: String(params.publicRate), PAYLOAD: String(params.payload), SAMPLE_FILE: join(dir, "gateway-samples.jsonl") },
  });
}
async function waitListening(p: ReturnType<typeof spawnGateway>) {
  const reader = p.stdout.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) { const { value, done } = await reader.read(); if (done) throw new Error("gateway 가 시작 전에 종료됨"); buf += dec.decode(value); if (buf.includes("listening")) break; }
  reader.releaseLock();
  return buf.trim();
}
let gw = spawnGateway();
console.log("gateway 시작:", await waitListening(gw));

const load = Bun.spawn(["bun", "load.ts", `--url=ws://127.0.0.1:${params.port}`, `--public=${params.public}`, `--private=${params.private}`, `--slow=${params.slow}`, `--slowAt=${params.slowAt}`, `--duration=${params.duration}`, `--window=${params.window}`, `--churnRate=${params.churnRate}`, `--churnAt=${params.churnAt}`, `--churnSec=${params.churnSec}`, `--out=${join(dir, "load-windows.jsonl")}`], { cwd: import.meta.dir, stdout: "inherit", stderr: "inherit" });
// 재접속 폭풍: 60초에 SIGTERM(정상 종료, bye+1001) → 2초 뒤 재기동, 150초에 SIGKILL(비정상) → 2초 뒤 재기동
const stormLog = join(dir, "storm-events.jsonl");
const stormTimers: ReturnType<typeof setTimeout>[] = [];
if (params.storm) {
  const sigs = ["SIGTERM", "SIGKILL"] as const;
  for (const [i, at] of params.stormAt.entries()) {
    const ev = { at, sig: sigs[i % 2]! };
    stormTimers.push(setTimeout(async () => {
      const killedAt = Date.now();
      gw.kill(ev.sig);
      await gw.exited;
      await new Promise((r) => setTimeout(r, 2000));
      gw = spawnGateway();
      await waitListening(gw);
      appendFileSync(stormLog, JSON.stringify({ sig: ev.sig, killedAt, restartedAt: Date.now() }) + "\n");
    }, ev.at * 1000));
  }
}
const stop = () => { load.kill("SIGINT"); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
await load.exited;
for (const t of stormTimers) clearTimeout(t); // 종료 뒤에 남은 폭풍 이벤트는 취소한다
gw.kill("SIGTERM");
await Promise.race([gw.exited, new Promise((r) => setTimeout(r, 5000))]);
console.log("분석:", dir);
const an = Bun.spawn(["bun", "analyze.ts", dir], { cwd: import.meta.dir, stdout: "inherit", stderr: "inherit" });
await an.exited;
process.exit(0);
