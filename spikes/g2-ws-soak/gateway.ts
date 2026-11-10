// G2 스파이크 — Bun WebSocket 게이트웨이(설계 RT-06 의 앱 레벨 송신 큐 방식). 제품 코드가 아니다.
// 작성: AI 초안 (Authorship: G). 실행·합격 기준은 README.md.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const env = (k: string, d: number) => Number(process.env[k] ?? d);
const PORT = env("PORT", 3100);
const PUBLIC_RATE = env("PUBLIC_RATE", 20); // 공개 채널 변경 이벤트/초 (각 이벤트가 공개 연결 전원에게 팬아웃)
const PRIVATE_RATE = env("PRIVATE_RATE", 0.2); // 비공개 연결당 메시지/초
const PAYLOAD = env("PAYLOAD", 200); // 메시지 본문 패딩 바이트
const HB_SEC = env("HB_SEC", 25);
const QMSG = env("QUEUE_MSGS", 64);
const QBYTES = env("QUEUE_BYTES", 262144);
const HIGH = env("SEND_HIGH_WATER", 65536); // ws 내부 버퍼가 이 값 미만일 때만 큐에서 꺼내 보낸다
const IDLE = env("IDLE_TIMEOUT", 120);
const SAMPLE_SEC = env("SAMPLE_SEC", 10);
const GC_SEC = env("GC_SEC", 300);
const SAMPLE_FILE = process.env.SAMPLE_FILE ?? "";

type Conn = { id: number; kind: "public" | "private"; ws: Bun.ServerWebSocket<Conn>; q: string[]; qb: number; seq: number; closed: boolean };

const conns = new Set<Conn>();
const stats = { opened: 0, peak: 0, sent: 0, sendDropped: 0, closed4408: 0, inbound: 0, published: 0, closes: {} as Record<string, number> };
let pubSeq = 0;
let nextId = 0;
const pad = "x".repeat(PAYLOAD);
const t0 = Date.now();

const write = (o: Record<string, unknown>) => {
  if (!SAMPLE_FILE) return;
  appendFileSync(SAMPLE_FILE, JSON.stringify({ t: Date.now(), ...o }) + "\n");
};
if (SAMPLE_FILE) mkdirSync(dirname(SAMPLE_FILE), { recursive: true });

function kill(c: Conn) {
  if (c.closed) return;
  c.closed = true;
  stats.closed4408++;
  try { c.ws.close(4408, "slow consumer"); } catch { /* 이미 닫힘 */ }
}
function pump(c: Conn) {
  while (c.q.length && !c.closed && c.ws.getBufferedAmount() < HIGH) {
    const m = c.q.shift()!;
    c.qb -= m.length;
    if (c.ws.send(m) === 0) stats.sendDropped++;
    stats.sent++;
  }
}
function offer(c: Conn, msg: string) {
  if (c.closed) return;
  if (c.q.length >= QMSG || c.qb + msg.length > QBYTES) return kill(c);
  c.q.push(msg);
  c.qb += msg.length;
  pump(c);
}

const server = Bun.serve<Conn>({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const kind = url.searchParams.get("kind") === "private" ? "private" : "public";
      const data = { id: ++nextId, kind, q: [], qb: 0, seq: 0, closed: false } as unknown as Conn;
      if (srv.upgrade(req, { data })) return;
      return new Response("upgrade failed", { status: 400 });
    }
    if (url.pathname === "/stats") return Response.json(snapshot());
    return new Response("ok");
  },
  websocket: {
    idleTimeout: IDLE,
    sendPings: true,
    open(ws) {
      const c = ws.data;
      c.ws = ws;
      conns.add(c);
      stats.opened++;
      stats.peak = Math.max(stats.peak, conns.size);
      offer(c, JSON.stringify({ t: "hello", head: pubSeq, kind: c.kind }));
    },
    message() { stats.inbound++; },
    drain(ws) { pump(ws.data); },
    close(ws, code) {
      conns.delete(ws.data);
      ws.data.closed = true;
      stats.closes[code] = (stats.closes[code] ?? 0) + 1;
    },
  },
});

// 공개 채널: 직렬화 1회, 공개 연결 전원에게 offer
setInterval(() => {
  const seq = ++pubSeq;
  stats.published++;
  const msg = JSON.stringify({ t: "ev", ch: "pub", seq, ts: Date.now(), d: pad });
  for (const c of conns) if (c.kind === "public") offer(c, msg);
}, 1000 / PUBLIC_RATE);

// 비공개: 연결마다 자기 순번. 초당 한 번, 확률 PRIVATE_RATE 로 보낸다
setInterval(() => {
  for (const c of conns) {
    if (c.kind !== "private" || Math.random() >= PRIVATE_RATE) continue;
    offer(c, JSON.stringify({ t: "ev", ch: "priv", seq: ++c.seq, ts: Date.now(), d: pad }));
  }
}, 1000);

// 25초 hb (순번 없음)
setInterval(() => {
  const msg = JSON.stringify({ t: "hb", head: pubSeq });
  for (const c of conns) offer(c, msg);
}, HB_SEC * 1000);

// 이벤트 루프 지연
let lagWindow: number[] = [];
let lagLast = performance.now();
setInterval(() => {
  const now = performance.now();
  lagWindow.push(Math.max(0, now - lagLast - 50));
  lagLast = now;
}, 50);
const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0);

function snapshot() {
  const m = process.memoryUsage();
  let pub = 0, priv = 0, qmax = 0;
  for (const c of conns) { if (c.kind === "public") pub++; else priv++; qmax = Math.max(qmax, c.q.length); }
  return { upSec: Math.round((Date.now() - t0) / 1000), rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, arrayBuffers: m.arrayBuffers, conns: { public: pub, private: priv }, queueMax: qmax, ...stats };
}

let cpuPrev = process.cpuUsage();
let tPrev = Date.now();
setInterval(() => {
  const cpu = process.cpuUsage(cpuPrev);
  const dt = (Date.now() - tPrev) / 1000;
  cpuPrev = process.cpuUsage();
  tPrev = Date.now();
  write({ type: "sample", ...snapshot(), cpuCores: Number(((cpu.user + cpu.system) / 1e6 / dt).toFixed(3)), lagP50: Number(q(lagWindow, 0.5).toFixed(2)), lagP99: Number(q(lagWindow, 0.99).toFixed(2)), lagMax: Number(q(lagWindow, 1).toFixed(2)) });
  lagWindow = [];
}, SAMPLE_SEC * 1000);

// 강제 GC 뒤의 힙: 누수(heapUsed 증가)와 단편화(rss 만 증가)를 구분한다
setInterval(() => {
  Bun.gc(true);
  const m = process.memoryUsage();
  write({ type: "gc", rss: m.rss, heapUsed: m.heapUsed, external: m.external });
}, GC_SEC * 1000);

// 종료: bye + close(1001), stop() 은 await 하지 않는다(1000 연결에서 교착 — tech-stack §11.1)
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const bye = JSON.stringify({ t: "bye" });
  for (const c of conns) { try { c.ws.send(bye); c.ws.close(1001, "going away"); } catch { /* ignore */ } }
  server.stop();
  const t = setInterval(() => { if (conns.size === 0) { clearInterval(t); process.exit(0); } }, 20);
  setTimeout(() => process.exit(0), 3000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

write({ type: "start", port: server.port, params: { PUBLIC_RATE, PRIVATE_RATE, PAYLOAD, HB_SEC, QMSG, QBYTES, HIGH, IDLE, SAMPLE_SEC, GC_SEC } });
console.log(JSON.stringify({ ev: "listening", port: server.port }));
