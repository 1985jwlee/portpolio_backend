// G5 스파이크 — 지표 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다.
// 작성: AI 초안 (Authorship: G).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildApp, buildMetrics, BUCKETS } from "./src/app";
import { LabelPolicy } from "./src/metrics";

const dir = import.meta.dir;
const PORT = 39500;
type R = { id: number; name: string; pass: boolean; detail: unknown };

// Prometheus 텍스트 파서(비주석 줄 → 이름·레이블·값)
const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(-?[0-9.eE+-]+|NaN|\+Inf|-Inf)$/;
function parse(text: string) {
  const series: { name: string; labels: Record<string, string>; value: number }[] = [];
  let bad = 0;
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = LINE.exec(line);
    if (!m) { bad++; continue; }
    const labels: Record<string, string> = {};
    if (m[3]) for (const kv of m[3].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) labels[kv[1]!] = kv[2]!;
    series.push({ name: m[1]!, labels, value: Number(m[4]) });
  }
  return { series, bad };
}
const find = (s: ReturnType<typeof parse>["series"], name: string, want: Record<string, string> = {}) => s.filter((x) => x.name === name && Object.entries(want).every(([k, v]) => x.labels[k] === v));

async function once(rep: number): Promise<{ results: R[]; observation: unknown }> {
  const errLines: string[] = []; // 시험 중 stderr 로 새는 예외를 센다(기준 12)
  const origErr = console.error;
  console.error = (...a: unknown[]) => { errLines.push(a.map(String).join(" ").slice(0, 120)); };
  const reg = buildMetrics("prod");
  const app = buildApp(reg).listen({ port: PORT, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${PORT}`;
  const get = (p: string, h: Record<string, string> = {}) => fetch(base + p, { headers: h }).then(async (r) => { await r.arrayBuffer(); return r.status; });
  const results: R[] = [];
  const scrape = async () => { const r = await fetch(base + "/metrics"); return { ct: r.headers.get("content-type") ?? "", text: await r.text() }; };

  try {
    // 2. 요청 수 정확성
    for (let i = 0; i < 20; i++) await get("/api/ping");
    for (let i = 0; i < 5; i++) await get(`/api/entries/${crypto.randomUUID()}`);
    // 3. 지연 히스토그램
    for (let i = 0; i < 10; i++) await get("/api/slow");
    await get("/api/error");
    // 4. outbox 적체 시뮬레이션
    reg.set("pf_outbox_depth", { status: "new" }, 7);
    reg.set("pf_outbox_oldest_age_seconds", { status: "new" }, 42);
    let s1 = await scrape();
    let p = parse(s1.text);

    // 1. 형식
    results.push({ id: 1, name: "/metrics 형식·파싱", pass: s1.ct.startsWith("text/plain") && s1.ct.includes("version=0.0.4") && p.bad === 0 && p.series.length > 0, detail: { contentType: s1.ct, unparsedLines: p.bad, series: p.series.length } });

    // 2. 요청 수
    const ping = find(p.series, "pf_http_requests_total", { route: "/api/ping" });
    const ent = find(p.series, "pf_http_requests_total", { route: "/api/entries/:id" });
    results.push({ id: 2, name: "pf_http_requests_total 정확성(ping 20, entries/:id 한 시리즈 5)", pass: ping.length === 1 && ping[0]!.value === 20 && ent.length === 1 && ent[0]!.value === 5, detail: { pingSeries: ping.length, ping: ping[0]?.value, entriesSeries: ent.length, entries: ent[0]?.value } });

    // 3. 히스토그램
    const le = (v: number | string) => find(p.series, "pf_http_request_duration_seconds_bucket", { route: "/api/slow", le: String(v) })[0]?.value;
    const expectLe = [...BUCKETS.map(String), "+Inf"];
    const hasAll = expectLe.every((b) => le(b) !== undefined);
    const cnt = find(p.series, "pf_http_request_duration_seconds_count", { route: "/api/slow" })[0]?.value;
    results.push({ id: 3, name: "히스토그램 버킷 12개·50ms 라우트의 버킷 누적", pass: hasAll && le(0.025) === 0 && le(0.1) === 10 && cnt === 10, detail: { hasAllBuckets: hasAll, le0_025: le(0.025), le0_1: le(0.1), count: cnt } });

    // 4. outbox 적체
    const d1 = find(p.series, "pf_outbox_depth", { status: "new" })[0]?.value, a1 = find(p.series, "pf_outbox_oldest_age_seconds", { status: "new" })[0]?.value;
    reg.set("pf_outbox_depth", { status: "new" }, 3);
    const d2 = find(parse((await scrape()).text).series, "pf_outbox_depth", { status: "new" })[0]?.value;
    results.push({ id: 4, name: "outbox 적체 지표가 큐 상태를 따라감(7→3, age 42)", pass: d1 === 7 && a1 === 42 && d2 === 3, detail: { depthFirst: d1, age: a1, depthAfterUpdate: d2 } });

    // 5·8. LabelPolicy
    let defThrows = false;
    try { buildMetrics("dev").define({ name: "pf_bad", help: "x", kind: "counter", labels: ["user_id"] }); } catch { defThrows = true; }
    let devThrows = false;
    try { buildMetrics("dev").inc("pf_unregistered_total", {}); } catch { devThrows = true; }
    const before = find(parse((await scrape()).text).series, "pf_metrics_dropped_total", { result: "unregistered" })[0]?.value ?? 0;
    reg.inc("pf_unregistered_total", {});
    const afterUnreg = find(parse((await scrape()).text).series, "pf_metrics_dropped_total", { result: "unregistered" })[0]?.value ?? 0;
    results.push({ id: 5, name: "LabelPolicy: 금지 레이블 정의 예외·미등록 dev 예외·prod 버림+집계", pass: defThrows && devThrows && afterUnreg === before + 1, detail: { defThrows, devThrows, droppedBefore: before, droppedAfter: afterUnreg } });
    const vBefore = find(parse((await scrape()).text).series, "pf_metrics_dropped_total", { result: "label_value" })[0]?.value ?? 0;
    reg.inc("pf_http_requests_total", { app: "spike", method: "GET", route: crypto.randomUUID(), status_class: "2xx" });
    const vAfter = find(parse((await scrape()).text).series, "pf_metrics_dropped_total", { result: "label_value" })[0]?.value ?? 0;
    const uuidInOutput = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test((await scrape()).text);
    results.push({ id: 8, name: "UUID 레이블 값 거부(prod 에서 버림+집계, 출력에 없음)", pass: vAfter === vBefore + 1 && !uuidInOutput && !LabelPolicy.valuesOk({ route: crypto.randomUUID() }), detail: { droppedBefore: vBefore, droppedAfter: vAfter, uuidInOutput } });

    // 6·7. 카디널리티
    const batch = async (mk: (i: number) => [string, Record<string, string>]) => { for (let i = 0; i < 1000; i += 50) await Promise.all(Array.from({ length: 50 }, (_, k) => get(...mk(i + k)))); };
    await batch((i) => [`/api/entries/${crypto.randomUUID()}`, { "X-Forwarded-For": `10.${i % 250}.${(i >> 8) % 250}.${i % 200}` }]);
    await batch((i) => [`/nope/${i}/${Math.random().toString(36).slice(2)}`, { "X-Forwarded-For": `172.16.${i % 250}.${i % 200}` }]);
    const full = (await scrape()).text;
    const p6 = parse(full);
    const httpSeries = new Set(find(p6.series, "pf_http_requests_total").map((x) => JSON.stringify(x.labels)));
    const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(full.split("\n").filter((l) => !l.startsWith("#") && !l.includes("nodejs_version_info")).join("\n"));
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(full);
    results.push({ id: 6, name: "카디널리티: 시리즈 ≤ 20, UUID·IPv4 0건", pass: httpSeries.size <= 20 && !ipv4 && !uuid, detail: { httpRequestSeries: httpSeries.size, ipv4InOutput: ipv4, uuidInOutput: uuid, labels: [...httpSeries].slice(0, 10) } });
    const un = find(p6.series, "pf_http_requests_total", { route: "unmatched" });
    results.push({ id: 7, name: "404 는 route=\"unmatched\" 한 시리즈", pass: un.length === 1 && un[0]!.labels.status_class === "4xx" && un[0]!.value === 1000, detail: { series: un.length, labels: un[0]?.labels, value: un[0]?.value } });

    // 9. 스크레이프 지연 (시리즈 약 100개로 맞춘 뒤)
    let n = p6.series.length;
    for (let i = 0; n < 100 && i < 100; i++, n++) reg.set("pf_outbox_depth", { status: `s${i}` }, i); // 허용 레이블 status 의 값만 늘려 시리즈를 채운다
    const lat: number[] = [];
    for (let i = 0; i < 50; i++) { const t = performance.now(); await scrape(); lat.push(performance.now() - t); }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.floor(lat.length * 0.95)]!;
    const seriesNow = parse((await scrape()).text).series.length;
    results.push({ id: 9, name: "스크레이프 지연 p95 ≤ 50ms(시리즈 약 100개)", pass: p95 <= 50 && seriesNow >= 100, detail: { p95Ms: Number(p95.toFixed(2)), medianMs: Number(lat[25]!.toFixed(2)), series: seriesNow } });

    // 12. 404 지연 기록과 예외 누출
    const unCount = find(p6.series, "pf_http_request_duration_seconds_count", { route: "unmatched" })[0]?.value;
    results.push({ id: 12, name: "404 도 지연 히스토그램에 기록, 미들웨어 예외 0건(발견 후 추가)", pass: unCount === 1000 && errLines.length === 0, detail: { unmatchedDurationCount: unCount, leakedErrors: errLines.length, sample: errLines.slice(0, 2) } });

    // 10. 기본 지표 관찰
    const lag = find(p6.series, "nodejs_eventloop_lag_seconds")[0]?.value, lagP99 = find(p6.series, "nodejs_eventloop_lag_p99_seconds")[0]?.value, rss = find(p6.series, "process_resident_memory_bytes")[0]?.value;
    return { results, observation: { eventloopLagSeconds: lag, eventloopLagP99Seconds: lagP99, residentMemoryBytes: rss, gcDurationSamples: find(p6.series, "nodejs_gc_duration_seconds_count").length } };
  } finally {
    console.error = origErr;
    app.stop();
    await Bun.sleep(200);
  }
}

async function main() {
  const runs: R[][] = [];
  let observation: unknown = null;
  for (let rep = 0; rep < 3; rep++) { const o = await once(rep); runs.push(o.results); observation = o.observation; }
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
  const perId = ids.map((id) => ({ id, name: runs[0]!.find((x) => x.id === id)!.name, passes: runs.map((r) => r.find((x) => x.id === id)!.pass) }));
  const repeat = perId.every((p) => p.passes.every(Boolean));
  const criteria = [...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })), { id: 11, name: "1~9·12 를 3회 반복해도 같다(반복마다 서버를 새로 띄움)", pass: repeat, detail: "" }];
  const verdict = repeat ? "PASS" : "FAIL";
  mkdirSync(join(dir, "results"), { recursive: true });
  const file = join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-verify.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, bun: Bun.version, runs, observation, verdict, criteria }, null, 2));
  console.log(`판정: ${verdict}`);
  for (const c of criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${c.detail}`);
  console.log("관찰(#10):", JSON.stringify(observation));
  for (const r of runs[0]!) if (!r.pass) console.log("실패 상세(1회차):", JSON.stringify(r));
  console.log("저장:", file);
}
await main();
process.exit(0);
