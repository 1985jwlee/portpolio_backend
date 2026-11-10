// G2 스파이크 — 부하·검증 클라이언트. 연결 N 개를 열고 순번 연속성·지연을 검증한다.
// 작성: AI 초안 (Authorship: G). 실행·합격 기준은 README.md.
//
// 사용: bun load.ts --url=ws://127.0.0.1:3100 --public=900 --private=100 --slow=10 --slowAt=1800 --duration=14400 --out=results/<run>/load-windows.jsonl
import { appendFileSync, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { dirname } from "node:path";

const opt: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) opt[m[1]!] = m[2]!;
}
const num = (k: string, d: number) => (opt[k] !== undefined ? Number(opt[k]) : d);
const URL_ = opt.url ?? "ws://127.0.0.1:3100";
const NPUB = num("public", 900);
const NPRIV = num("private", 100);
const NSLOW = num("slow", 0);
const SLOW_AT = num("slowAt", 1800);
const DURATION = num("duration", 3600);
const WINDOW = num("window", 60);
const OUT = opt.out ?? "";
const RAMP_MS = num("rampMs", 5); // 연결 사이 간격
if (OUT) mkdirSync(dirname(OUT), { recursive: true });
const write = (o: Record<string, unknown>) => { if (OUT) appendFileSync(OUT, JSON.stringify({ t: Date.now(), ...o }) + "\n"); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 윈도 통계 (지연 히스토그램: 1ms 칸, 2000ms 초과는 마지막 칸)
const LAT_MAX = 2000;
const newWin = () => ({ msgs: 0, gaps: 0, dups: 0, reorders: 0, lat: new Int32Array(LAT_MAX + 1), latSum: 0, opens: 0, closes: {} as Record<string, number>, reconnects: 0, recoverMs: [] as number[], parseErr: 0, connFail: 0 });
let win = newWin();
const total = { connFail: 0, msgs: 0, gaps: 0, dups: 0, reorders: 0, opens: 0, reconnects: 0, closes: {} as Record<string, number>, normalConnClosesUnexpected: 0 };
const pct = (h: Int32Array, n: number, p: number) => { if (!n) return null; let acc = 0; const target = Math.ceil(p * n); for (let i = 0; i < h.length; i++) { acc += h[i]!; if (acc >= target) return i; } return h.length - 1; };

let stopping = false;
let openNow = 0;
const jitter = (ms: number) => ms * (0.5 + Math.random());

function client(kind: "public" | "private") {
  let lastSeq: number | null = null;
  let attempt = 0;
  let closedAt = 0;
  const start = () => {
    if (stopping) return;
    const ws = new WebSocket(`${URL_}/ws?kind=${kind}`);
    let wasOpen = false;
    ws.onopen = () => {
      wasOpen = true;
      openNow++; win.opens++; total.opens++;
      if (closedAt) { win.recoverMs.push(Date.now() - closedAt); win.reconnects++; total.reconnects++; closedAt = 0; }
      attempt = 0;
      lastSeq = null; // 재접속 후에는 새 기준선(이 스파이크 서버는 replay 가 없다)
    };
    ws.onmessage = (e) => {
      let m: { t: string; seq?: number; ts?: number };
      try { m = JSON.parse(String(e.data)); } catch { win.parseErr++; return; }
      if (m.t === "bye") return;
      if (m.t !== "ev" || m.seq === undefined) return;
      win.msgs++; total.msgs++;
      if (lastSeq !== null) {
        if (m.seq === lastSeq) { win.dups++; total.dups++; }
        else if (m.seq < lastSeq) { win.reorders++; total.reorders++; }
        else if (m.seq !== lastSeq + 1) { win.gaps++; total.gaps++; }
      }
      if (lastSeq === null || m.seq > lastSeq) lastSeq = m.seq;
      const lat = Math.min(LAT_MAX, Math.max(0, Date.now() - (m.ts ?? Date.now())));
      win.lat[lat]!++; win.latSum += lat;
    };
    ws.onclose = (e) => {
      if (wasOpen) {
        openNow--; // 연결에 성공한 적이 있는 소켓만 센다(접속 실패 재시도는 connFail 로 따로)
        const k = String(e.code);
        win.closes[k] = (win.closes[k] ?? 0) + 1; total.closes[k] = (total.closes[k] ?? 0) + 1;
      } else { win.connFail++; total.connFail++; }
      if (stopping) return;
      closedAt = closedAt || Date.now();
      attempt++;
      setTimeout(start, jitter(Math.min(30000, 250 * 2 ** (attempt - 1)))); // 지수 백오프 250ms→30s, 지터 ±50%
    };
    ws.onerror = () => { /* onclose 에서 처리 */ };
  };
  start();
}

// 느린 소비자: 업그레이드만 하고 읽기를 멈춘다(TCP 창이 차서 서버 큐가 넘친다)
const slowSockets: ReturnType<typeof connect>[] = [];
function slowConsumer() {
  const u = new URL(URL_.replace(/^ws/, "http"));
  const s = connect({ host: u.hostname, port: Number(u.port || 80) }, () => {
    s.write(`GET /ws?kind=public HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    setTimeout(() => s.pause(), 50);
  });
  s.on("error", () => {});
  slowSockets.push(s);
}

async function report(final = false) {
  const w = win; win = newWin();
  const n = w.msgs;
  const closes = w.closes;
  write({ type: final ? "final-window" : "window", openNow, msgs: n, gaps: w.gaps, dups: w.dups, reorders: w.reorders, parseErr: w.parseErr, connFail: w.connFail, latP50: pct(w.lat, n, 0.5), latP99: pct(w.lat, n, 0.99), latMax: pct(w.lat, n, 1), latMean: n ? Number((w.latSum / n).toFixed(2)) : null, opens: w.opens, reconnects: w.reconnects, recoverP50: w.recoverMs.length ? w.recoverMs.sort((a, b) => a - b)[Math.floor(w.recoverMs.length / 2)] : null, recoverMax: w.recoverMs.length ? Math.max(...w.recoverMs) : null, closes });
}

(async () => {
  const startAt = Date.now();
  console.log(JSON.stringify({ ev: "start", url: URL_, NPUB, NPRIV, NSLOW, SLOW_AT, DURATION }));
  write({ type: "start", url: URL_, NPUB, NPRIV, NSLOW, SLOW_AT, DURATION, WINDOW });
  for (let i = 0; i < NPUB; i++) { client("public"); await sleep(RAMP_MS); }
  for (let i = 0; i < NPRIV; i++) { client("private"); await sleep(RAMP_MS); }
  const winTimer = setInterval(() => report(), WINDOW * 1000);
  let slowDone = false;
  const slowTimer = setInterval(() => {
    if (!slowDone && NSLOW > 0 && Date.now() - startAt >= SLOW_AT * 1000) { slowDone = true; write({ type: "slow-injected", n: NSLOW }); for (let i = 0; i < NSLOW; i++) slowConsumer(); }
  }, 1000);
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(winTimer); clearInterval(slowTimer);
    await report(true);
    let serverStats: unknown = null;
    try { serverStats = await (await fetch(URL_.replace(/^ws/, "http") + "/stats")).json(); } catch { /* ignore */ }
    const summary = { type: "summary", durationSec: Math.round((Date.now() - startAt) / 1000), total, serverStats };
    write(summary);
    console.log(JSON.stringify(summary));
    for (const s of slowSockets) s.destroy();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setTimeout(stop, DURATION * 1000);
})();
