// S0-2 비교용 게이트웨이. VARIANT: A(Bun.serve+앱큐) B(Elysia+앱큐) C(Elysia 라우트 옵션) D(Elysia 최상위 옵션) E(Bun.serve 네이티브 옵션)
// 작성: AI 초안 (Authorship: G).
import { Elysia } from "elysia";
import { announce, cfg, mkConn, onClose, onOpen, pump, QUEUED, shutdownWith, snapshot, stats, type Conn, type RawWs } from "./src/common";

const V = cfg.VARIANT;
const native = { backpressureLimit: cfg.BP_LIMIT, closeOnBackpressureLimit: true };

if (V === "A" || V === "E") {
  const server = Bun.serve<{ conn: Conn }>({
    port: cfg.PORT,
    hostname: "0.0.0.0",
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const conn = mkConn(url.searchParams.get("kind") === "private" ? "private" : "public");
        if (srv.upgrade(req, { data: { conn } })) return;
        return new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/stats") return Response.json(snapshot());
      return new Response("ok");
    },
    websocket: {
      idleTimeout: cfg.IDLE,
      sendPings: true,
      ...(V === "E" ? native : {}),
      open(ws) { ws.data.conn.raw = ws as unknown as RawWs; onOpen(ws.data.conn); },
      message() { stats.inbound++; },
      drain(ws) { if (QUEUED) pump(ws.data.conn); },
      close(ws, code) { onClose(ws.data.conn, code); },
    },
  });
  shutdownWith(() => server.stop());
  announce({ runtime: "Bun.serve" });
} else {
  const byRaw = new WeakMap<object, Conn>();
  const wsHooks = {
    idleTimeout: cfg.IDLE,
    sendPings: true,
    ...(V === "C" ? native : {}), // C: 라우트 옵션
    open(ws: any) {
      const kind = ws.data?.query?.kind === "private" ? "private" : "public";
      const c = mkConn(kind);
      c.raw = ws.raw as RawWs;
      byRaw.set(ws.raw, c);
      onOpen(c);
    },
    message() { stats.inbound++; },
    drain(ws: any) { const c = byRaw.get(ws.raw); if (c && QUEUED) pump(c); },
    close(ws: any, code: number) { const c = byRaw.get(ws.raw); if (c) onClose(c, code); },
  };
  const app = new Elysia(V === "D" ? { websocket: { idleTimeout: cfg.IDLE, sendPings: true, ...native } } : {}) // D: 최상위 옵션
    .get("/stats", () => snapshot())
    .get("/", () => "ok")
    .ws("/ws", wsHooks as any)
    .listen({ port: cfg.PORT, hostname: "0.0.0.0" });
  shutdownWith(() => app.stop());
  announce({ runtime: "Elysia" });
}
