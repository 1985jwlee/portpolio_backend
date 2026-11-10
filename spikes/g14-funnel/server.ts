// G14 스파이크 서버 — Funnel 시험용 에코 서버. 시험이 끝나면 내린다(저장소 제품 코드 아님).
// 작성: AI 초안 (Authorship: G). 실행법은 README.md.
import os from "node:os";

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN = process.env.G14_TOKEN ?? "";
if (!TOKEN) {
  console.error("G14_TOKEN 환경변수가 필요하다(공개 주소에 에코 서버가 그대로 열리지 않게 하는 토큰).");
  process.exit(1);
}

type WsData = { id: number; hb: number; openedAt: number; msgs: number; bytes: number };
let seq = 0;
const timers = new Map<number, ReturnType<typeof setInterval>>();
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

const server = Bun.serve<WsData>({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.searchParams.get("k") !== TOKEN) return new Response("not found", { status: 404 });
    const headers = Object.fromEntries(req.headers);

    if (url.pathname === "/ws") {
      const hb = Number(url.searchParams.get("hb") ?? 0);
      log({ ev: "upgrade", socketIp: srv.requestIP(req), headers });
      const ok = srv.upgrade(req, { data: { id: ++seq, hb, openedAt: Date.now(), msgs: 0, bytes: 0 } });
      if (ok) return;
      return new Response("upgrade failed", { status: 400 });
    }
    if (url.pathname === "/echo") {
      return Response.json({ method: req.method, url: req.url, socketIp: srv.requestIP(req), headers, now: Date.now() });
    }
    if (url.pathname === "/meta") {
      return Response.json({
        bun: Bun.version, platform: process.platform, release: os.release(),
        cpuModel: os.cpus()[0]?.model, cpus: os.cpus().length, loadavg: os.loadavg(),
        totalMem: os.totalmem(), freeMem: os.freemem(), uptimeSec: os.uptime(),
      });
    }
    if (url.pathname === "/bytes") {
      const n = Math.min(Number(url.searchParams.get("n") ?? 0), 100 * 1024 * 1024);
      const chunk = new Uint8Array(64 * 1024);
      let sent = 0;
      return new Response(new ReadableStream({
        pull(ctl) {
          if (sent >= n) return ctl.close();
          const len = Math.min(chunk.length, n - sent);
          ctl.enqueue(chunk.subarray(0, len));
          sent += len;
        },
      }), { headers: { "content-type": "application/octet-stream", "content-length": String(n) } });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    // 서버 쪽이 먼저 끊어 결과를 오염시키지 않게 한다: 자동 ping 끔, 유휴 한도는 최대(960초).
    sendPings: false,
    idleTimeout: 960,
    open(ws) {
      const d = ws.data;
      log({ ev: "open", id: d.id, hb: d.hb });
      ws.send(JSON.stringify({ type: "hello", id: d.id, t: Date.now() }));
      if (d.hb > 0) {
        timers.set(d.id, setInterval(() => ws.send(JSON.stringify({ type: "hb", t: Date.now() })), d.hb * 1000));
      }
    },
    message(ws, msg) {
      ws.data.msgs++;
      ws.data.bytes += typeof msg === "string" ? Buffer.byteLength(msg) : msg.byteLength;
      ws.send(msg);
    },
    close(ws, code, reason) {
      const d = ws.data;
      const timer = timers.get(d.id);
      if (timer) clearInterval(timer);
      timers.delete(d.id);
      log({ ev: "close", id: d.id, code, reason, openMs: Date.now() - d.openedAt, msgs: d.msgs, bytes: d.bytes });
    },
  },
});

log({ ev: "listening", port: server.port });
