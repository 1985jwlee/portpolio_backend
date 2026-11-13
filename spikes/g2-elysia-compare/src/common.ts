// S0-2 비교용 공용 모듈. 작성: AI 초안 (Authorship: G).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const env = (k: string, d: number) => Number(process.env[k] ?? d);
export const cfg = {
  VARIANT: process.env.VARIANT ?? "A",
  PORT: env("PORT", 3150),
  PUBLIC_RATE: env("PUBLIC_RATE", 20),
  PRIVATE_RATE: env("PRIVATE_RATE", 0.2),
  PAYLOAD: env("PAYLOAD", 200),
  HB_SEC: env("HB_SEC", 25),
  QMSG: env("QUEUE_MSGS", 64),
  QBYTES: env("QUEUE_BYTES", 262144),
  HIGH: env("SEND_HIGH_WATER", 65536),
  IDLE: env("IDLE_TIMEOUT", 120),
  SAMPLE_SEC: env("SAMPLE_SEC", 5),
  BP_LIMIT: env("BP_LIMIT", 262144), // C·D·E: 런타임 백프레셔 한도(앱 큐 바이트 상한과 같게)
  SAMPLE_FILE: process.env.SAMPLE_FILE ?? "",
};
/** A·B 는 앱 레벨 큐, C·D·E 는 런타임 옵션에 맡기고 곧바로 보낸다 */
export const QUEUED = cfg.VARIANT === "A" || cfg.VARIANT === "B";

export type RawWs = { send(m: string): number; getBufferedAmount(): number; close(code?: number, reason?: string): void };
export type Conn = { id: number; kind: "public" | "private"; raw: RawWs; q: string[]; qb: number; seq: number; closed: boolean };

export const conns = new Set<Conn>();
export const stats = { opened: 0, peak: 0, sent: 0, sendDropped: 0, closed4408: 0, inbound: 0, published: 0, closes: {} as Record<string, number> };
let pubSeq = 0;
let nextId = 0;
const pad = "x".repeat(cfg.PAYLOAD);
const t0 = Date.now();

if (cfg.SAMPLE_FILE) mkdirSync(dirname(cfg.SAMPLE_FILE), { recursive: true });
const write = (o: Record<string, unknown>) => { if (cfg.SAMPLE_FILE) appendFileSync(cfg.SAMPLE_FILE, JSON.stringify({ t: Date.now(), ...o }) + "\n"); };

export const mkConn = (kind: "public" | "private"): Conn => ({ id: ++nextId, kind, raw: undefined as unknown as RawWs, q: [], qb: 0, seq: 0, closed: false });

function kill(c: Conn) {
  if (c.closed) return;
  c.closed = true;
  stats.closed4408++;
  try { c.raw.close(4408, "slow consumer"); } catch { /* 이미 닫힘 */ }
}
export function pump(c: Conn) {
  while (c.q.length && !c.closed && c.raw.getBufferedAmount() < cfg.HIGH) {
    const m = c.q.shift()!;
    c.qb -= m.length;
    if (c.raw.send(m) === 0) stats.sendDropped++;
    stats.sent++;
  }
}
function offerQueued(c: Conn, msg: string) {
  if (c.closed) return;
  if (c.q.length >= cfg.QMSG || c.qb + msg.length > cfg.QBYTES) return kill(c);
  c.q.push(msg);
  c.qb += msg.length;
  pump(c);
}
function offerDirect(c: Conn, msg: string) {
  if (c.closed) return;
  if (c.raw.send(msg) === 0) stats.sendDropped++;
  stats.sent++;
}
export const offer = QUEUED ? offerQueued : offerDirect;

export function onOpen(c: Conn) {
  conns.add(c);
  stats.opened++;
  stats.peak = Math.max(stats.peak, conns.size);
  offer(c, JSON.stringify({ t: "hello", head: pubSeq, kind: c.kind }));
}
export function onClose(c: Conn, code: number) {
  conns.delete(c);
  c.closed = true;
  stats.closes[code] = (stats.closes[code] ?? 0) + 1;
}

// 발행자: 10ms 틱마다 rate×0.01 건(소수는 누적). 시각은 건별로 찍는다
let acc = 0;
setInterval(() => {
  acc += cfg.PUBLIC_RATE * 0.01;
  const n = Math.floor(acc);
  acc -= n;
  for (let i = 0; i < n; i++) {
    const seq = ++pubSeq;
    stats.published++;
    const msg = JSON.stringify({ t: "ev", ch: "pub", seq, ts: Date.now(), d: pad });
    for (const c of conns) if (c.kind === "public") offer(c, msg);
  }
}, 10);
setInterval(() => {
  for (const c of conns) {
    if (c.kind !== "private" || Math.random() >= cfg.PRIVATE_RATE) continue;
    offer(c, JSON.stringify({ t: "ev", ch: "priv", seq: ++c.seq, ts: Date.now(), d: pad }));
  }
}, 1000);
setInterval(() => { const msg = JSON.stringify({ t: "hb", head: pubSeq }); for (const c of conns) offer(c, msg); }, cfg.HB_SEC * 1000);

// 이벤트 루프 지연·표본
let lagWindow: number[] = [];
let lagLast = performance.now();
setInterval(() => { const now = performance.now(); lagWindow.push(Math.max(0, now - lagLast - 50)); lagLast = now; }, 50);
const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0);

export function snapshot() {
  const m = process.memoryUsage();
  let pub = 0, priv = 0, qmax = 0;
  for (const c of conns) { if (c.kind === "public") pub++; else priv++; qmax = Math.max(qmax, c.q.length); }
  return { variant: cfg.VARIANT, upSec: Math.round((Date.now() - t0) / 1000), rss: m.rss, heapUsed: m.heapUsed, external: m.external, conns: { public: pub, private: priv }, queueMax: qmax, ...stats };
}
let cpuPrev = process.cpuUsage();
let tPrev = Date.now();
setInterval(() => {
  const cpu = process.cpuUsage(cpuPrev);
  const dt = (Date.now() - tPrev) / 1000;
  cpuPrev = process.cpuUsage();
  tPrev = Date.now();
  write({ type: "sample", ...snapshot(), cpuCores: Number(((cpu.user + cpu.system) / 1e6 / dt).toFixed(3)), lagP99: Number(q(lagWindow, 0.99).toFixed(2)), lagMax: Number(q(lagWindow, 1).toFixed(2)) });
  lagWindow = [];
}, cfg.SAMPLE_SEC * 1000);

export function shutdownWith(stop: () => void) {
  let stopping = false;
  const go = () => {
    if (stopping) return;
    stopping = true;
    const bye = JSON.stringify({ t: "bye" });
    for (const c of conns) { try { c.raw.send(bye); c.raw.close(1001, "going away"); } catch { /* ignore */ } }
    try { stop(); } catch { /* ignore */ }
    const t = setInterval(() => { if (conns.size === 0) { clearInterval(t); process.exit(0); } }, 20);
    setTimeout(() => process.exit(0), 3000);
  };
  process.on("SIGTERM", go);
  process.on("SIGINT", go);
}
export const announce = (extra: Record<string, unknown> = {}) => {
  write({ type: "start", cfg, ...extra });
  console.log(JSON.stringify({ ev: "listening", variant: cfg.VARIANT, port: cfg.PORT }));
};
