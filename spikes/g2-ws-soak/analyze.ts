// G2 스파이크 — 소크 결과 분석과 합격 판정. 기준값은 README.md 에 시험 전에 고정한 것과 같아야 한다.
// 작성: AI 초안 (Authorship: G).
//
// 사용: bun analyze.ts results/<run>   (gateway-samples.jsonl, load-windows.jsonl, meta.json 을 읽는다)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── 합격 기준 (README.md '합격 기준' 표와 일치해야 한다) ──
const CRIT = {
  warmupMin: Number(process.env.WARMUP_MIN ?? 10), // 목표 연결 수에 도달한 뒤 제외할 분
  rssSlopeMbPerHourMax: 2, // 워밍업 이후 RSS 선형회귀 기울기
  rssEndOverWarmMax: 1.2, // 종료 RSS / 워밍업 종료 RSS
  heapSlopeMbPerHourMax: 0.5, // 강제 GC 뒤 heapUsed 기울기
  latWindowP99MaxMs: 100,
  latMedianP99MaxMs: 50,
  lagP99MedianMaxMs: 20,
  slowP99RatioMax: 1.5,
};

const STORM_RECOVER_SEC_MAX = 30; // 서버 복귀 후 전원(99%) 재접속까지
const dir = process.argv[2];
if (!dir) { console.error("usage: bun analyze.ts results/<run>"); process.exit(1); }
const readJsonl = (f: string) => readFileSync(join(dir, f), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf-8"));
const gw = readJsonl("gateway-samples.jsonl");
const ld = readJsonl("load-windows.jsonl");

const samples = gw.filter((r) => r.type === "sample");
const gcs = gw.filter((r) => r.type === "gc");
const target = (meta.params.public + meta.params.private) * 0.99;
const reached = samples.find((s) => s.conns.public + s.conns.private >= target);
const t0 = reached ? reached.t : samples[0]?.t ?? 0;
const warmEnd = t0 + CRIT.warmupMin * 60_000;
const churnStartRec = ld.find((r) => r.type === "churn-start"); // churn 모드에서는 접속·해제 부하 구간이 판정 구간이다
const after = samples.filter((s) => s.t >= (churnStartRec ? churnStartRec.t : warmEnd));

const slope = (pts: { x: number; y: number }[]) => { // 최소제곱 기울기 (y 단위/시간)
  const n = pts.length; if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0; for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : null;
};
const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
const MB = 1048576;

const spanH = samples.length ? (samples.at(-1).t - warmEnd) / 3_600_000 : 0;
const longEnough = spanH >= 0.5; // 워밍업 이후 30분 미만이면 기울기 판정을 하지 않는다(INCOMPLETE)
const rssSlope = slope(after.map((s) => ({ x: (s.t - warmEnd) / 3_600_000, y: s.rss / MB })));
const warmRss = med(samples.filter((s) => s.t >= warmEnd && s.t < warmEnd + 60_000).map((s) => s.rss / MB));
const endRss = med(samples.slice(-6).map((s) => s.rss / MB));
const gcAfter = gcs.filter((g) => g.t >= warmEnd);
const heapSlope = slope(gcAfter.map((g) => ({ x: (g.t - warmEnd) / 3_600_000, y: g.heapUsed / MB })));
const lagMed = med(after.map((s) => s.lagP99));
const cpuMed = med(after.map((s) => s.cpuCores));

const wins = ld.filter((r) => r.type === "window");
const sum = ld.find((r) => r.type === "summary");
const csRec = ld.find((r) => r.type === "churn-start"), ceRec = ld.find((r) => r.type === "churn-end");
const winsAfter = csRec ? wins.filter((w) => w.t >= csRec.t && w.t <= (ceRec?.t ?? Infinity) + 60_000 && w.latP99 !== null) : wins.filter((w) => w.t >= warmEnd && w.latP99 !== null);
const p99s = winsAfter.map((w) => w.latP99 as number);
const gaps = wins.reduce((a, w) => a + w.gaps, 0), dups = wins.reduce((a, w) => a + w.dups, 0), reorders = wins.reduce((a, w) => a + w.reorders, 0);
const unexpectedCloses = wins.reduce((a, w) => a + Object.values(w.closes as Record<string, number>).reduce((x, y) => x + y, 0) + (w.connFail ?? 0), 0);

// 느린 소비자: 주입 전/후 10분 창의 p99 비교
const inj = ld.find((r) => r.type === "slow-injected");
let slowEval: Record<string, unknown> | null = null;
if (inj) {
  const before = wins.filter((w) => w.t < inj.t && w.t >= inj.t - 10 * 60_000 && w.latP99 !== null).map((w) => w.latP99 as number);
  const afterInj = wins.filter((w) => w.t >= inj.t + 60_000 && w.t < inj.t + 11 * 60_000 && w.latP99 !== null).map((w) => w.latP99 as number);
  const b = med(before), a = med(afterInj);
  const killedAt = samples.find((x) => x.t >= inj.t && x.closed4408 >= inj.n);
  slowEval = { slowKilledAfterSec: killedAt ? Math.round((killedAt.t - inj.t) / 1000) : null, injectedAt: new Date(inj.t).toISOString(), n: inj.n, p99BeforeMedian: b, p99AfterMedian: a, ratio: b && a ? Number((a / b).toFixed(2)) : null, serverClosed4408: sum?.serverStats?.closed4408 ?? null };
}

const checks: { name: string; value: unknown; limit: string; pass: boolean | null }[] = [
  { name: "RSS 기울기(워밍업 이후)", value: rssSlope === null ? null : Number(rssSlope.toFixed(3)), limit: `≤ ${CRIT.rssSlopeMbPerHourMax} MB/h`, pass: rssSlope === null || !longEnough ? null : rssSlope <= CRIT.rssSlopeMbPerHourMax },
  { name: "종료 RSS / 워밍업 종료 RSS", value: warmRss && endRss ? Number((endRss / warmRss).toFixed(3)) : null, limit: `≤ ${CRIT.rssEndOverWarmMax}`, pass: warmRss && endRss && longEnough ? endRss / warmRss <= CRIT.rssEndOverWarmMax : null },
  { name: "강제 GC 뒤 heapUsed 기울기", value: heapSlope === null ? null : Number(heapSlope.toFixed(3)), limit: `≤ ${CRIT.heapSlopeMbPerHourMax} MB/h`, pass: heapSlope === null || !longEnough ? null : heapSlope <= CRIT.heapSlopeMbPerHourMax },
  { name: "순번 gap·중복·역전(정상 연결)", value: { gaps, dups, reorders }, limit: "전부 0", pass: gaps + dups + reorders === 0 },
  { name: "정상 연결의 예기치 않은 종료", value: unexpectedCloses, limit: "0", pass: unexpectedCloses === 0 },
  { name: "팬아웃 지연 창별 p99 최댓값", value: p99s.length ? Math.max(...p99s) : null, limit: `≤ ${CRIT.latWindowP99MaxMs} ms`, pass: p99s.length ? Math.max(...p99s) <= CRIT.latWindowP99MaxMs : null },
  { name: "팬아웃 지연 창별 p99 중앙값", value: med(p99s), limit: `≤ ${CRIT.latMedianP99MaxMs} ms`, pass: p99s.length ? med(p99s)! <= CRIT.latMedianP99MaxMs : null },
  { name: "이벤트 루프 지연 p99 중앙값", value: lagMed, limit: `≤ ${CRIT.lagP99MedianMaxMs} ms`, pass: lagMed === null ? null : lagMed <= CRIT.lagP99MedianMaxMs },
];
if (meta.params.slow > 0) {
  const s = slowEval as { ratio: number | null; serverClosed4408: number | null };
  checks.push({ name: "느린 소비자 격리(서버가 4408 로 끊은 수)", value: s?.serverClosed4408 ?? null, limit: `= ${meta.params.slow} (정상 연결은 0)`, pass: s?.serverClosed4408 == null ? null : s.serverClosed4408 === meta.params.slow });
  checks.push({ name: "주입 후/전 p99 비율", value: s?.ratio ?? null, limit: `≤ ${CRIT.slowP99RatioMax}`, pass: s?.ratio == null ? null : s.ratio <= CRIT.slowP99RatioMax });
}

if (meta.params.storm) {
  // 소크 항목(RSS·GC 기울기)은 재시작으로 끊겨 의미가 없으므로 폭풍 모드에서는 제외한다
  for (let i = checks.length - 1; i >= 0; i--) if (/RSS|heapUsed|예기치 않은 종료/.test(checks[i]!.name)) checks.splice(i, 1);
  const evs = readFileSync(join(dir, "storm-events.jsonl"), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const totalConns = meta.params.public + meta.params.private;
  for (const ev of evs) {
    const w = wins.find((x) => x.t >= ev.restartedAt && x.openNow >= totalConns * 0.99);
    const sec = w ? Number(((w.t - ev.restartedAt) / 1000).toFixed(1)) : null;
    const failsAfter = wins.filter((x) => x.t >= ev.killedAt && x.t <= (w?.t ?? Infinity)).reduce((a, x) => a + Object.values(x.closes as Record<string, number>).reduce((p, q) => p + q, 0) + (x.connFail ?? 0), 0);
    checks.push({ name: `재접속 복구(${ev.sig}) — 서버 복귀 후 99% 재접속까지`, value: { sec, closesInWindow: failsAfter }, limit: `≤ ${STORM_RECOVER_SEC_MAX}s (창 해상도 ${meta.params.window}s)`, pass: sec === null ? false : sec <= STORM_RECOVER_SEC_MAX + meta.params.window });
  }
  const rec = wins.filter((x) => x.recoverP50 !== null);
  checks.push({ name: "재접속 지연 p50/max (클라이언트 관측, ms)", value: { p50: med(rec.map((x) => x.recoverP50)), max: rec.length ? Math.max(...rec.map((x) => x.recoverMax)) : null }, limit: "참고(판정 아님)", pass: true });
}
if (meta.params.churnRate > 0) {
  // 소크의 기울기·종료 항목은 빼고 접속·해제 시험 기준(README ‘접속·해제 시험’)으로 판정한다
  for (let i = checks.length - 1; i >= 0; i--) if (/RSS 기울기|종료 RSS|heapUsed 기울기|느린 소비자|주입 후/.test(checks[i]!.name)) checks.splice(i, 1);
  const cs = ld.find((r) => r.type === "churn-start"), ce = ld.find((r) => r.type === "churn-end");
  const steady = meta.params.public + meta.params.private;
  const churn = sum?.churn;
  const baseRss = med(samples.filter((x) => cs && x.t >= cs.t - 60_000 && x.t < cs.t).map((x) => x.rss / MB));
  const endRss2 = med(samples.filter((x) => ce && x.t >= ce.t + 60_000).map((x) => x.rss / MB));
  const baseGc = [...gcs].reverse().find((g) => cs && g.t < cs.t);
  const endGc = [...gcs].reverse().find((g) => ce && g.t >= ce.t + 30_000);
  const finalConns = sum?.serverStats ? sum.serverStats.conns.public + sum.serverStats.conns.private : null;
  const opened = sum?.serverStats?.opened ?? null;
  const expectedOpened = churn ? steady + churn.started - churn.failed : null;
  checks.push(
    { name: "접속·해제 시작 횟수", value: churn?.started ?? null, limit: "≥ 59,000", pass: churn ? churn.started >= 59000 : null },
    { name: "정착 후 서버 연결 수(회수)", value: finalConns, limit: `= ${steady}`, pass: finalConns === null ? null : finalConns === steady },
    { name: "RSS 정착 후 − 기준선", value: baseRss && endRss2 ? Number((endRss2 - baseRss).toFixed(1)) + " MB (" + baseRss.toFixed(1) + "→" + endRss2.toFixed(1) + ")" : null, limit: "≤ +10 MB", pass: baseRss && endRss2 ? endRss2 - baseRss <= 10 : null },
    { name: "강제 GC 후 힙 정착 후 − 기준선", value: baseGc && endGc ? Number(((endGc.heapUsed - baseGc.heapUsed) / MB).toFixed(2)) + " MB" : null, limit: "≤ +2 MB", pass: baseGc && endGc ? (endGc.heapUsed - baseGc.heapUsed) / MB <= 2 : null },
    { name: "서버 opened 회계(고정+시도−실패)", value: opened !== null && expectedOpened !== null ? { server: opened, expected: expectedOpened } : null, limit: "±1%", pass: opened !== null && expectedOpened !== null && churn ? Math.abs(opened - expectedOpened) <= 0.01 * churn.started : null },
  );
}
const verdict = checks.some((c) => c.pass === false) ? "FAIL" : checks.some((c) => c.pass === null) ? "INCOMPLETE" : "PASS";
const result = {
  run: meta.run, verdict, durationAtTargetMin: Number(((samples.at(-1)?.t - t0) / 60000).toFixed(1)), samples: samples.length, afterWarmupSamples: after.length,
  rssMb: { warmEnd: warmRss && Number(warmRss.toFixed(1)), end: endRss && Number(endRss.toFixed(1)) }, cpuCoresMedian: cpuMed, checks, slowEval,
  load: { totalMsgs: sum?.total?.msgs, serverStats: sum?.serverStats }, criteria: CRIT,
};
writeFileSync(join(dir, "summary.json"), JSON.stringify(result, null, 2));
console.log(`판정: ${verdict}   (목표 연결 도달 후 ${result.durationAtTargetMin}분, 표본 ${samples.length}개)`);
for (const c of checks) console.log(`${c.pass === true ? "PASS" : c.pass === false ? "FAIL" : "N/A "}  ${c.name}: ${JSON.stringify(c.value)}   (${c.limit})`);
console.log(`RSS 워밍업 종료 ${result.rssMb.warmEnd}MB → 종료 ${result.rssMb.end}MB, CPU 중앙값 ${cpuMed}코어`);
