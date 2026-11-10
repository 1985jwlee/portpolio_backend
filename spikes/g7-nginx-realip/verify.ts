// G7 스파이크 — nginx 주소 정규화 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다.
// 작성: AI 초안 (Authorship: G).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const NET = "g7net";
const SUBNET = "172.28.0.0/16";
const PORT_T = 38080;
const PORT_U = 38081;
const IMAGES = ["nginx:stable", "nginx:stable-alpine", "nginx:mainline"];
const sh = (cmd: string) => { const r = Bun.spawnSync(["sh", "-c", cmd]); return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim() }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Result = { id: number; name: string; pass: boolean; detail: unknown };
const q = async (port: number, headers: Record<string, string>) => {
  const res = await fetch(`http://127.0.0.1:${port}/`, { headers });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() as { socketIp: { address: string }; headers: Record<string, string> } : null;
  return { status: res.status, body };
};

function cleanup() {
  sh("docker rm -f g7-upstream g7-nginx-t g7-nginx-u >/dev/null 2>&1");
  sh(`docker network rm ${NET} >/dev/null 2>&1`);
}

async function suite(rep: number): Promise<Result[]> {
  const ip = (n: number) => `10.${rep + 1}.${n}.1`; // 반복마다 다른 주소를 써서 limit_req 상태가 섞이지 않게 한다
  const out: Result[] = [];

  // 2. 신뢰 홉의 X-Forwarded-For → X-Client-IP
  let r = await q(PORT_T, { "X-Forwarded-For": ip(2) });
  out.push({ id: 2, name: "신뢰 홉의 XFF 가 X-Client-IP 로 정규화", pass: r.body?.headers["x-client-ip"] === ip(2) && r.body?.headers["x-forwarded-for"] === ip(2), detail: { sent: ip(2), clientIp: r.body?.headers["x-client-ip"], xff: r.body?.headers["x-forwarded-for"] } });

  // 3. 위조 주소 헤더는 도달하지 않는다
  r = await q(PORT_T, { "X-Forwarded-For": ip(3), "X-Real-IP": "9.9.9.9", "X-Client-IP": "8.8.8.8", "CF-Connecting-IP": "7.7.7.7" });
  const h3 = r.body?.headers ?? {};
  out.push({ id: 3, name: "위조 X-Real-IP·X-Client-IP·CF-Connecting-IP 가 도달하지 않음", pass: h3["x-client-ip"] === ip(3) && h3["x-real-ip"] === undefined && h3["cf-connecting-ip"] === undefined, detail: { clientIp: h3["x-client-ip"], realIp: h3["x-real-ip"] ?? null, cf: h3["cf-connecting-ip"] ?? null } });

  // 4. 다중값 → 마지막 값
  r = await q(PORT_T, { "X-Forwarded-For": `6.6.6.6, ${ip(4)}` });
  out.push({ id: 4, name: "다중값 XFF 는 마지막 값만 채택", pass: r.body?.headers["x-client-ip"] === ip(4), detail: { sent: `6.6.6.6, ${ip(4)}`, clientIp: r.body?.headers["x-client-ip"] } });

  // 5. 신뢰 대역 밖 소스의 위조 XFF 는 무시
  r = await q(PORT_U, { "X-Forwarded-For": "5.5.5.5" });
  const c5 = r.body?.headers["x-client-ip"];
  out.push({ id: 5, name: "신뢰 대역 밖 소스의 위조 XFF 는 무시", pass: c5 !== undefined && c5 !== "5.5.5.5" && c5.startsWith("172.28."), detail: { sent: "5.5.5.5", clientIp: c5 } });

  // 6. IPv6
  r = await q(PORT_T, { "X-Forwarded-For": "2001:db8::1" });
  out.push({ id: 6, name: "IPv6 주소 정규화", pass: r.body?.headers["x-client-ip"] === "2001:db8::1", detail: { clientIp: r.body?.headers["x-client-ip"] } });

  // 7. limit_req 는 정규화된 주소가 키
  const A = ip(70), B = ip(71);
  const burst = await Promise.all(Array.from({ length: 30 }, () => q(PORT_T, { "X-Forwarded-For": A })));
  const a429 = burst.filter((x) => x.status === 429).length;
  const bRes = await Promise.all(Array.from({ length: 3 }, () => q(PORT_T, { "X-Forwarded-For": B })));
  const b429 = bRes.filter((x) => x.status === 429).length;
  out.push({ id: 7, name: "limit_req 가 정규화된 주소를 키로 쓴다", pass: a429 >= 1 && b429 === 0, detail: { A429: a429, ofA: 30, B429: b429, ofB: 3 } });

  // 8. WebSocket
  const wsOk = await new Promise<{ ok: boolean; echo?: string; err?: string }>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT_T}/ws`, { headers: { "X-Forwarded-For": ip(8) } } as unknown as string[]);
    const t = setTimeout(() => resolve({ ok: false, err: "timeout" }), 5000);
    ws.onopen = () => ws.send("g7-ping");
    ws.onmessage = (e) => { clearTimeout(t); resolve({ ok: String(e.data) === "g7-ping", echo: String(e.data) }); ws.close(); };
    ws.onerror = () => { clearTimeout(t); resolve({ ok: false, err: "error" }); };
  });
  out.push({ id: 8, name: "WebSocket 업그레이드 통과·에코", pass: wsOk.ok, detail: wsOk });

  // 9. 비정상 입력에서도 nginx 가 살아 있다
  const big = Array.from({ length: 1000 }, (_, i) => `1.1.${i % 250}.1`).join(", ") + `, ${ip(9)}`;
  let bigStatus: number | string = "x";
  try { bigStatus = (await q(PORT_T, { "X-Forwarded-For": big })).status; } catch (e) { bigStatus = String(e).slice(0, 60); }
  const bad = await q(PORT_T, { "X-Forwarded-For": "not-an-ip" });
  const alive = (await q(PORT_T, { "X-Forwarded-For": ip(91) })).status === 200 && sh("docker inspect -f '{{.State.Running}}' g7-nginx-t").out.includes("true");
  out.push({ id: 9, name: "8KB 초과·잘못된 XFF 에도 nginx 생존", pass: alive && [200, 400, 414, 431].includes(bigStatus as number) && [200, 400].includes(bad.status), detail: { bigHeaderBytes: big.length, bigStatus, badStatus: bad.status, badClientIp: bad.body?.headers["x-client-ip"] ?? null, alive } });
  return out;
}

async function main() {
  cleanup();
  const results: { images: Record<string, { realip: boolean; version: string }>; runs: Result[][]; stableNginxV: string } = { images: {}, runs: [], stableNginxV: "" };

  // 1. realip 모듈
  for (const img of IMAGES) {
    const v = sh(`docker run --rm ${img} nginx -V`);
    results.images[img] = { realip: v.out.includes("--with-http_realip_module"), version: (v.out.match(/nginx version: [^\n]*/) ?? [""])[0] };
    if (img === "nginx:stable") results.stableNginxV = v.out;
  }

  try {
    sh(`docker network create --subnet ${SUBNET} ${NET}`);
    const u = sh(`docker run -d --name g7-upstream --network ${NET} --network-alias upstream -v ${dir}:/app:ro -w /app oven/bun:1.4.4 bun upstream.ts`);
    if (u.code !== 0) throw new Error("upstream 기동 실패: " + u.out);
    const t = sh(`docker run -d --name g7-nginx-t --network ${NET} -p 127.0.0.1:${PORT_T}:80 -v ${dir}/nginx.trusted.conf:/etc/nginx/nginx.conf:ro nginx:stable`);
    const n = sh(`docker run -d --name g7-nginx-u --network ${NET} -p 127.0.0.1:${PORT_U}:80 -v ${dir}/nginx.untrusted.conf:/etc/nginx/nginx.conf:ro nginx:stable`);
    if (t.code !== 0 || n.code !== 0) throw new Error("nginx 기동 실패: " + t.out + n.out);
    for (const port of [PORT_T, PORT_U]) { // 두 nginx 가 모두 응답할 때까지 기다린다
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).status === 200; } catch { /* 준비 중 */ } if (!ready) await sleep(250); }
      if (!ready) throw new Error(`nginx(${port}) 가 준비되지 않음: ` + sh("docker logs g7-nginx-u 2>&1 | tail -5; docker logs g7-nginx-t 2>&1 | tail -5").out);
    }
    for (let rep = 0; rep < 3; rep++) results.runs.push(await suite(rep));
  } finally {
    cleanup();
  }

  // 판정
  const img1 = Object.values(results.images).every((x) => x.realip);
  const allIds = [2, 3, 4, 5, 6, 7, 8, 9];
  const perId = allIds.map((id) => ({ id, name: results.runs[0]!.find((x) => x.id === id)!.name, passes: results.runs.map((run) => run.find((x) => x.id === id)!.pass) }));
  const repeat = perId.every((p) => p.passes.every(Boolean));
  const summary = { verdict: img1 && repeat ? "PASS" : "FAIL", criteria: [{ id: 1, name: "세 이미지 모두 realip 모듈 포함", pass: img1, detail: results.images }, ...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })), { id: 10, name: "nginx:stable 3회 반복 결과 동일", pass: repeat, detail: "위 2~9 가 3회 모두 통과" }] };

  const resDir = join(dir, "results");
  mkdirSync(resDir, { recursive: true });
  const file = join(resDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-verify.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, docker: sh("docker version --format '{{.Server.Version}}'").out, bun: Bun.version, ...results, summary }, null, 2));
  console.log(`판정: ${summary.verdict}`);
  for (const c of summary.criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${typeof c.detail === "string" ? c.detail : ""}`);
  for (const r of results.runs[0]!) if (!r.pass) console.log("실패 상세(1회차):", JSON.stringify(r));
  console.log("저장:", file);
}
await main();
