// G14 스파이크 클라이언트 — Funnel 경유 측정. 결과 원시 JSON 을 results/ 에 남긴다(ADR-050).
// 작성: AI 초안 (Authorship: G). 실행법은 README.md.
//
// 사용: G14_TOKEN=... bun client.ts <headers|ws-echo|idle|throughput|http> <base-url> [--key=value ...]
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const [cmd, baseArg, ...rest] = process.argv.slice(2);
const TOKEN = process.env.G14_TOKEN ?? "";
if (!cmd || !baseArg || !TOKEN) {
  console.error("usage: G14_TOKEN=... bun client.ts <headers|ws-echo|idle|throughput|http> <base-url> [--key=value ...]");
  process.exit(1);
}
const base = baseArg.replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");
const opt: Record<string, string> = {};
for (const a of rest) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) opt[m[1]!] = m[2]!;
}
const num = (k: string, d: number) => (opt[k] !== undefined ? Number(opt[k]) : d);
const q = (arr: number[], p: number) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor(p * s.length))]!.toFixed(2));
};
const stats = (arr: number[]) => ({ n: arr.length, p50: q(arr, 0.5), p95: q(arr, 0.95), p99: q(arr, 0.99), max: q(arr, 1) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const url = (path: string, extra = "") => `${base}${path}${path.includes("?") ? "&" : "?"}k=${TOKEN}${extra}`;

function git(args: string[]) {
  try {
    // 스크립트 폴더를 cwd 로 고정한다(실행 위치에 따라 dirty 판정이 틀리던 버그 수정, 2026-11-10).
    const r = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir });
    return r.exitCode === 0 ? r.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

async function save(result: Record<string, unknown>) {
  let serverMeta: unknown = null;
  try {
    serverMeta = await (await fetch(url("/meta"))).json();
  } catch {
    /* 서버 메타를 못 얻어도 결과는 남긴다 */
  }
  const out = {
    cmd, base, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    options: opt,
    client: { bun: Bun.version, platform: process.platform, release: os.release(), cpus: os.cpus().length, loadavg: os.loadavg() },
    server: serverMeta,
    commit: git(["rev-parse", "HEAD"]), dirty: (git(["status", "--porcelain", "--", "."]) ?? "").length > 0,
    result,
  };
  const dir = join(import.meta.dir, "results");
  mkdirSync(dir, { recursive: true });
  // 같은 밀리초에 시작한 병렬 실행이 서로 덮어쓰지 않게 pid 를 붙인다(2026-11-10 idle 두 건이 충돌했다).
  const file = join(dir, `${startedAt.toISOString().replace(/[:.]/g, "-")}-${cmd}-p${process.pid}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n저장: ${file}`);
}

const startedAt = new Date();

function openWs(path: string, timeoutMs = 15000) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}${path}${path.includes("?") ? "&" : "?"}k=${TOKEN}`);
    ws.binaryType = "arraybuffer";
    const t = setTimeout(() => reject(new Error("ws open timeout")), timeoutMs);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
  });
}

// ① 통과·왕복·close 코드
async function wsEcho() {
  const n = num("n", 100);
  const t0 = performance.now();
  const ws = await openWs("/ws");
  const connectMs = performance.now() - t0;
  const rtts: number[] = [];
  let closeInfo: { code: number; reason: string } | null = null;
  const closed = new Promise<void>((res) => { ws.onclose = (e) => { closeInfo = { code: e.code, reason: e.reason }; res(); }; });
  let waiter: ((v: string) => void) | null = null;
  ws.onmessage = (e) => {
    const s = String(e.data);
    if (s.includes('"hello"')) return;
    waiter?.(s);
  };
  for (let i = 0; i < n; i++) {
    const sent = performance.now();
    const reply = new Promise<string>((r) => { waiter = r; });
    ws.send(JSON.stringify({ seq: i }));
    await Promise.race([reply, sleep(10000).then(() => { throw new Error(`echo timeout seq=${i}`); })]);
    rtts.push(performance.now() - sent);
  }
  ws.close(1000, "g14-done");
  await Promise.race([closed, sleep(5000)]);
  await save({ connectMs: Number(connectMs.toFixed(1)), rtt: stats(rtts), clientCloseObserved: closeInfo, note: "서버 로그의 close 코드와 대조할 것" });
}

// 콜드 스타트·단절 관찰: 일정 간격으로 WS 접속을 시도하며 시각별 성공/실패를 남긴다.
// 서버에서 `funnel reset` → 다시 켜기를 하는 동안 돌려 두고, 켠 직후 첫 시도가 실패하는지 본다.
async function wsWatch() {
  const secs = num("secs", 240);
  const interval = num("interval", 2000);
  const timeout = num("timeout", 5000);
  const attempts: { t: string; ok: boolean; ms: number; error?: string }[] = [];
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const t0 = performance.now();
    const t = new Date().toISOString();
    try {
      const ws = await openWs("/ws", timeout);
      attempts.push({ t, ok: true, ms: Number((performance.now() - t0).toFixed(1)) });
      ws.close(1000);
    } catch (e) {
      attempts.push({ t, ok: false, ms: Number((performance.now() - t0).toFixed(1)), error: String(e) });
    }
    await sleep(interval);
  }
  const ok = attempts.filter((a) => a.ok).length;
  await save({ secs, interval, timeout, total: attempts.length, ok, failed: attempts.length - ok, attempts });
}

// ⑦ WS 접속 성공률: 짧게 열고 닫기를 반복한다(간헐 실패 확인)
async function wsConnect() {
  const n = num("n", 50);
  const gapMs = num("gap", 200);
  const connectMs: number[] = [];
  const failures: { i: number; error: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      const ws = await openWs("/ws", num("timeout", 10000));
      connectMs.push(performance.now() - t0);
      ws.close(1000);
    } catch (e) {
      failures.push({ i, error: String(e) });
    }
    await sleep(gapMs);
  }
  await save({ n, ok: n - failures.length, failed: failures.length, successRate: Number(((n - failures.length) / n).toFixed(4)), connectMs: stats(connectMs), failures });
}

// ② 무 ping 유휴 타임아웃 (hb=0 이면 서버가 아무것도 보내지 않는다)
async function idle() {
  const hb = num("hb", 0);
  const cap = num("cap", 900);
  const ws = await openWs(`/ws?hb=${hb}`);
  const t0 = performance.now();
  let hbSeen = 0;
  let closeInfo: { code: number; reason: string } | null = null;
  ws.onmessage = (e) => { if (String(e.data).includes('"hb"')) hbSeen++; };
  const closed = new Promise<void>((res) => { ws.onclose = (e) => { closeInfo = { code: e.code, reason: e.reason }; res(); }; });
  const tick = setInterval(() => console.log(`... ${Math.round((performance.now() - t0) / 1000)}s hb=${hbSeen} state=${ws.readyState}`), 60000);
  await Promise.race([closed, sleep(cap * 1000)]);
  clearInterval(tick);
  const elapsed = (performance.now() - t0) / 1000;
  const survivedToCap = closeInfo === null;
  if (survivedToCap) ws.close(1000, "cap");
  await save({ hb, capSec: cap, elapsedSec: Number(elapsed.toFixed(1)), survivedToCap, closeInfo, hbReceived: hbSeen,
    note: survivedToCap ? `관찰 상한 ${cap}s 까지 유지됨(상한 이상은 미관찰)` : "끊긴 시각이 유휴 타임아웃의 상한 추정" });
}

// ③ 처리량·지연 체감 (한도 수치는 비공개라 체감만)
async function throughput() {
  const conns = num("conns", 10);
  const size = num("size", 65536);
  const secs = num("secs", 15);
  const mode = opt.mode ?? "both";
  const result: Record<string, unknown> = { conns, size, secs };

  if (mode === "ws" || mode === "both") {
    const payload = "x".repeat(size);
    const rtts: number[] = [];
    let msgs = 0;
    let bytes = 0;
    let errors = 0;
    const end = performance.now() + secs * 1000;
    await Promise.all(Array.from({ length: conns }, async () => {
      try {
        const ws = await openWs("/ws");
        let waiter: (() => void) | null = null;
        ws.onmessage = (e) => { if (!String(e.data).includes('"hello"')) waiter?.(); };
        while (performance.now() < end) {
          const sent = performance.now();
          const reply = new Promise<void>((r) => { waiter = r; });
          ws.send(payload);
          await Promise.race([reply, sleep(10000).then(() => { throw new Error("timeout"); })]);
          rtts.push(performance.now() - sent);
          msgs++;
          bytes += size * 2;
        }
        ws.close(1000);
      } catch {
        errors++;
      }
    }));
    result.ws = { msgs, errors, mbPerSec: Number((bytes / 1048576 / secs).toFixed(2)), rtt: stats(rtts) };
  }

  if (mode === "http" || mode === "both") {
    const n = num("bytes", 50 * 1024 * 1024);
    const par = num("par", 1);
    const t0 = performance.now();
    const each = await Promise.all(Array.from({ length: par }, async () => {
      const s = performance.now();
      const res = await fetch(url("/bytes", `&n=${n}`));
      let got = 0;
      for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) got += c.length;
      const sec = (performance.now() - s) / 1000;
      return { receivedBytes: got, sec: Number(sec.toFixed(2)), mbPerSec: Number((got / 1048576 / sec).toFixed(2)) };
    }));
    const total = (performance.now() - t0) / 1000;
    const bytes = each.reduce((a, e) => a + e.receivedBytes, 0);
    result.httpDownload = { requestedBytesEach: n, par, each, aggregateMbPerSec: Number((bytes / 1048576 / total).toFixed(2)), totalSec: Number(total.toFixed(2)) };
  }
  await save(result);
}

// ⑦⑧ HTTP 동시성 (429 여부 포함)
async function http() {
  const conc = num("conc", 50);
  const total = num("total", 500);
  const runs = num("runs", 3);
  const path = opt.path ?? "/echo";
  const all: unknown[] = [];
  for (let r = 0; r < runs; r++) {
    const lat: number[] = [];
    const status: Record<string, number> = {};
    let next = 0;
    const t0 = performance.now();
    await Promise.all(Array.from({ length: conc }, async () => {
      while (next < total) {
        next++;
        const s = performance.now();
        try {
          const res = await fetch(url(path));
          await res.arrayBuffer();
          status[res.status] = (status[res.status] ?? 0) + 1;
        } catch (e) {
          const key = `error:${String((e as Error)?.message ?? e).slice(0, 80)}`;
          status[key] = (status[key] ?? 0) + 1;
        }
        lat.push(performance.now() - s);
      }
    }));
    const sec = (performance.now() - t0) / 1000;
    all.push({ run: r + 1, sec: Number(sec.toFixed(2)), rps: Number((total / sec).toFixed(1)), status, latencyMs: stats(lat) });
  }
  await save({ path, conc, total, runs: all });
}

// ④ 헤더·소켓 주소
async function headers() {
  const res = await fetch(url("/echo"), { headers: { "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" } });
  const body = await res.json() as { headers: Record<string, string>; socketIp: unknown };
  const ipLike = Object.entries(body.headers).filter(([k]) => /forward|real|client|ip|via|tailscale/i.test(k));
  await save({ status: res.status, socketIp: body.socketIp, ipRelatedHeaders: Object.fromEntries(ipLike), allHeaders: body.headers,
    note: "x-forwarded-for 에 위조 값(203.0.113.7)을 보냈다. 서버가 받은 값에 그 값이 섞였는지, 실제 클라이언트 IP 가 있는지 비교할 것" });
}

const commands: Record<string, () => Promise<void>> = { headers, "ws-echo": wsEcho, "ws-connect": wsConnect, "ws-watch": wsWatch, idle, throughput, http };
const fn = commands[cmd];
if (!fn) { console.error(`알 수 없는 명령: ${cmd}`); process.exit(1); }
// --at=<epoch ms>: 그 시각까지 기다렸다가 시작한다(휴대폰 lab 페이지와 동시 시작용, 시계 편차 수 초는 허용)
if (opt.at) {
  const wait = Number(opt.at) - Date.now();
  console.log(`시작까지 ${Math.round(wait / 1000)}초 대기`);
  if (wait > 0) await sleep(wait);
}
await fn();
