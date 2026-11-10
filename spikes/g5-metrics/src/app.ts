// G5 스파이크 — Elysia 앱과 HTTP 지표 미들웨어. 작성: AI 초안 (Authorship: G).
import client from "prom-client";
import { Elysia } from "elysia";
import { MetricsRegistry } from "./metrics";

export const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5, 5];

export function buildMetrics(mode: "dev" | "prod") {
  const reg = new MetricsRegistry(mode);
  reg.define({ name: "pf_http_requests_total", help: "HTTP 요청 수", kind: "counter", labels: ["app", "method", "route", "status_class"] });
  reg.define({ name: "pf_http_request_duration_seconds", help: "HTTP 응답 시간", kind: "histogram", labels: ["app", "method", "route", "status_class"], buckets: BUCKETS });
  reg.define({ name: "pf_outbox_depth", help: "outbox 적체 건수", kind: "gauge", labels: ["status"] });
  reg.define({ name: "pf_outbox_oldest_age_seconds", help: "outbox 가장 오래된 항목 나이", kind: "gauge", labels: ["status"] });
  client.collectDefaultMetrics({ register: reg.registry });
  return reg;
}

export function buildApp(reg: MetricsRegistry) {
  const sc = (status: unknown) => `${Math.floor(Number(status ?? 200) / 100)}xx`;
  return new Elysia()
    .derive(() => ({ t0: performance.now() }))
    .onAfterResponse(({ t0, request, route, set }) => {
      const labels = { app: "spike", method: request.method, route: route && route.length ? route : "unmatched", status_class: sc(set.status) };
      reg.inc("pf_http_requests_total", labels);
      reg.observe("pf_http_request_duration_seconds", labels, (performance.now() - t0) / 1000);
    })
    .get("/api/ping", () => "pong")
    .get("/api/entries/:id", ({ params }) => ({ id: params.id }))
    .get("/api/slow", async () => { await Bun.sleep(50); return "slow"; })
    .get("/api/error", ({ set }) => { set.status = 500; return "err"; })
    .get("/metrics", async ({ set }) => { set.headers["content-type"] = reg.contentType; return await reg.text(); });
}
