// 기준 9 진단: SIGTERM 이 안 먹는 이유가 (a) 서버/Bun 비호환인지 (b) 클라이언트 keep-alive 인지 가른다.
import { spawn } from "node:child_process";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function trial(label: string, mode: "established" | "none" | "keepalive-idle" | "close-conn" | "inflight" | "after-load" | "after-load-inflight", extraEnv: Record<string,string> = {}) {
  const port = 39650 + Math.floor(Math.random() * 40);
  const p = spawn("bun", [".next/standalone/server.js"], { env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; p.stderr!.on("data", (d) => (err += d)); let out = ""; p.stdout!.on("data", (d) => (out += d));
  let exit: any = null; p.on("exit", (c, s) => (exit = { c, s }));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await sleep(200); }
  if (mode === "keepalive-idle") { await (await fetch(`http://127.0.0.1:${port}/ko`)).text(); }
  if (mode === "close-conn") { await (await fetch(`http://127.0.0.1:${port}/ko`, { headers: { connection: "close" } })).text(); }
  const base = `http://127.0.0.1:${port}`;
  if (mode === "after-load" || mode === "after-load-inflight") {
    const end = Date.now() + 8000;
    await Promise.all(Array.from({ length: 10 }, async () => { while (Date.now() < end) await (await fetch(base + "/ko")).text(); }));
  }
  let inflight: Promise<unknown> | null = null;
  if (mode === "established") { inflight = fetch(base + "/ko").then((r) => r.text()).then(() => "ok").catch((e) => "err:" + e.message); await sleep(4); }
  else if (mode === "inflight" || mode === "after-load-inflight") inflight = fetch(base + "/ko").then((r) => r.text()).then(() => "ok").catch((e) => "err:" + e.message);
  else await sleep(300);
  const t = performance.now(); p.kill("SIGTERM");
  while (!exit && performance.now() - t < 15000) await sleep(100);
  const sec = ((performance.now() - t) / 1000).toFixed(1);
  const inflightResult = inflight ? await Promise.race([inflight, sleep(3000).then(() => "timeout")]) : undefined;
  console.log(label, JSON.stringify({ exit, sec, inflightResult, stderr: err.slice(0, 200), stdoutTail: out.slice(-160) }));
  if (!exit) p.kill("SIGKILL");
  await sleep(500);
}



await trial("G1 연결 직후 SIGTERM(부하 없음)", "established");
await trial("G2 같은 조건 반복", "established");
await trial("F1 부하 직후 + 처리 중 (반복)", "after-load-inflight");
await trial("H 부하 직후 + 처리 중, KEEP_ALIVE_TIMEOUT=1000", "after-load-inflight", { KEEP_ALIVE_TIMEOUT: "1000" });
