// G7 스파이크 — 받은 요청 정보를 그대로 돌려주는 업스트림. 제품 코드가 아니다.
// 작성: AI 초안 (Authorship: G).
Bun.serve({
  port: 3000,
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/ws" && srv.upgrade(req)) return;
    return Response.json({ socketIp: srv.requestIP(req), headers: Object.fromEntries(req.headers) });
  },
  websocket: { message(ws, m) { ws.send(m); } },
});
console.log("upstream listening");
