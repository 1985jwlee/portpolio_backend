// G11 스파이크 — 모듈 추출 가능성 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다. 작성: AI 초안 (Authorship: G).
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { signActorToken, type ActorContext } from "./packages/kernel/src/index";
import { createGuestbook } from "./modules/guestbook/src/index";
import { buildSnapshot } from "./modules/realtime/src/index";

const dir = import.meta.dir;
type R = { id: number; name: string; pass: boolean; detail: unknown };
const step = (rep: number, s: string) => console.error(`[rep ${rep}] ${new Date().toISOString().slice(11, 19)} ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SECRET = "g11-test-secret";

function copyTree(dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const d of ["packages", "modules", "apps", "tools"]) cpSync(join(dir, d), join(dest, d), { recursive: true, filter: (s) => !s.includes("node_modules") });
  cpSync(join(dir, "package.json"), join(dest, "package.json"));
}
const run = (cmd: string[], cwd?: string, env?: Record<string, string>) => { const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env } }); return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim() }; };
const gate = (root: string, sub: "imports" | "version") => run(["bun", join(dir, "tools", "gate.ts"), sub, root]);

type PkgInfo = { path: string; name: string; deps: string[] };
function pkgIndex(root: string): Map<string, PkgInfo> {
  const m = new Map<string, PkgInfo>();
  for (const g of ["packages", "modules", "apps"]) for (const d of readdirSync(join(root, g))) {
    const p = join(root, g, d); if (!existsSync(join(p, "package.json"))) continue;
    const j = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
    m.set(j.name, { path: p, name: j.name, deps: Object.keys(j.dependencies ?? {}).filter((x) => x.startsWith("@pf/")) });
  }
  return m;
}
const closure = (idx: Map<string, PkgInfo>, name: string, seen = new Set<string>()): Set<string> => { if (seen.has(name)) return seen; seen.add(name); for (const d of idx.get(name)!.deps) closure(idx, d, seen); return seen; };

/** 선언한 의존의 복사본만 node_modules/@pf 에 두고 패키지를 놓는다. */
function isolate(root: string, name: string, omit: string[] = []) {
  const idx = pkgIndex(root);
  const tmp = mkdtempSync(join(tmpdir(), "g11-iso-"));
  const need = closure(idx, name); need.delete(name);
  for (const d of need) if (!omit.includes(d)) cpSync(idx.get(d)!.path, join(tmp, "node_modules", d), { recursive: true, filter: (s) => !s.includes("node_modules") });
  cpSync(idx.get(name)!.path, join(tmp, "pkg"), { recursive: true, filter: (s) => !s.includes("node_modules") });
  return { tmp, need: [...need], entry: existsSync(join(tmp, "pkg", "src", "main.ts")) ? "src/main.ts" : "src/index.ts" };
}
const build = (tmp: string, entry: string) => run(["bun", "build", join(tmp, "pkg", entry), "--target=bun", "--outfile", join(tmp, "out.js")]);

const BUILDABLE = ["@pf/kernel", "@pf/guestbook-contract", "@pf/guestbook", "@pf/guestbook-client", "@pf/realtime", "@pf/guestbook-service"];
const actorA: ActorContext = { actorKey: "session:a", kind: "anonymous", roles: [] };
const actorB: ActorContext = { actorKey: "session:b", kind: "anonymous", roles: [] };

async function scenario(port: import("./modules/guestbook-contract/src/index").GuestbookPort) {
  const out: unknown[] = [];
  out.push(await port.postEntry(actorA, "hello"));
  out.push(await port.postEntry(actorB, "world"));
  out.push(await port.postEntry(actorA, ""));
  out.push(await port.postEntry(actorA, "x".repeat(201)));
  out.push(await port.listEntries(actorA));
  out.push(await port.listEntries(actorB));
  out.push(await buildSnapshot(port, actorA));
  out.push(await buildSnapshot(port, actorB));
  return out;
}

async function once(rep: number): Promise<R[]> {
  const res: R[] = [];
  const work = mkdtempSync(join(tmpdir(), "g11-work-"));
  const created: string[] = [work];
  try {
    step(rep, "1 깨끗한 트리");
    const gi = gate(dir, "imports"), gv = gate(dir, "version");
    res.push({ id: 1, name: "깨끗한 트리: imports·version 위반 0", pass: gi.code === 0 && gv.code === 0, detail: { imports: gi.out, version: gv.out } });

    step(rep, "2 임포트 음성 대조");
    const cases: { key: string; expect: string; mutate: (r: string) => void }[] = [
      { key: "a", expect: "G-b", mutate: (r) => { const p = join(r, "modules/realtime/package.json"); const j = JSON.parse(readFileSync(p, "utf8")); j.dependencies["@pf/guestbook"] = "workspace:*"; writeFileSync(p, JSON.stringify(j)); writeFileSync(join(r, "modules/realtime/src/inject.ts"), 'import { createGuestbook } from "@pf/guestbook";\nexport const x = createGuestbook;\n'); } },
      { key: "b", expect: "G-a", mutate: (r) => { const p = join(r, "modules/realtime/package.json"); const j = JSON.parse(readFileSync(p, "utf8")); delete j.dependencies["@pf/guestbook-contract"]; writeFileSync(p, JSON.stringify(j)); } },
      { key: "c", expect: "G-c", mutate: (r) => writeFileSync(join(r, "modules/realtime/src/inject.ts"), 'import "../../guestbook/src/index";\n') },
      { key: "d", expect: "G-d", mutate: (r) => writeFileSync(join(r, "modules/guestbook-contract/src/inject.ts"), 'import "lodash";\n') },
      { key: "e", expect: "G-e", mutate: (r) => writeFileSync(join(r, "packages/kernel/src/inject.ts"), 'import "@pf/guestbook-contract";\n') },
    ];
    const neg = cases.map((c) => { const r = join(work, `neg-${c.key}`); copyTree(r); c.mutate(r); const g = gate(r, "imports"); return { case: c.key, expect: c.expect, code: g.code, detected: g.code !== 0 && g.out.includes(c.expect) }; });
    res.push({ id: 2, name: "임포트 위반 5종 주입: 기대한 규칙 ID 로 모두 검출", pass: neg.every((n) => n.detected), detail: neg });

    step(rep, "3 격리 빌드");
    const builds = BUILDABLE.map((n) => { const iso = isolate(dir, n); created.push(iso.tmp); const b = build(iso.tmp, iso.entry); return { pkg: n, deps: iso.need, code: b.code, tail: b.code === 0 ? undefined : b.out.slice(-200) }; });
    res.push({ id: 3, name: "6개 단위가 선언한 의존만으로 격리 빌드", pass: builds.every((b) => b.code === 0), detail: builds });

    step(rep, "4 격리 빌드 음성 대조");
    const iso4 = isolate(dir, "@pf/realtime", ["@pf/guestbook-contract"]); created.push(iso4.tmp);
    const b4 = build(iso4.tmp, iso4.entry);
    res.push({ id: 4, name: "계약 복사본을 뺀 realtime 빌드는 실패", pass: b4.code !== 0, detail: { code: b4.code, tail: b4.out.slice(-200) } });

    step(rep, "5 버전 게이트");
    const v = join(work, "ver");
    const schemaPath = (r: string) => join(r, "modules/guestbook-contract/src/schemas.ts");
    const pkgPath = (r: string) => join(r, "modules/guestbook-contract/package.json");
    const bump = (r: string, ver: string) => { const j = JSON.parse(readFileSync(pkgPath(r), "utf8")); j.version = ver; writeFileSync(pkgPath(r), JSON.stringify(j)); };
    const addField = (r: string) => writeFileSync(schemaPath(r), readFileSync(schemaPath(r), "utf8").replace('required: ["id", "body", "createdAt", "mine"]', 'required: ["id", "body", "createdAt", "mine", "likes"]'));
    const vA = v + "-a"; copyTree(vA); addField(vA); const gA = gate(vA, "version");
    const vB = v + "-b"; copyTree(vB); addField(vB); bump(vB, "2.0.0"); const gB = gate(vB, "version");
    const vC = v + "-c"; copyTree(vC); bump(vC, "1.0.1"); const gC = gate(vC, "version");
    res.push({ id: 5, name: "버전 게이트: 변경+유지 → V-1 실패 / 변경+승급 → 통과 / 불변+승급 → 통과", pass: gA.code !== 0 && gA.out.includes("V-1") && gB.code === 0 && gC.code === 0, detail: { unchangedVersion: { code: gA.code, out: gA.out }, bumped: { code: gB.code }, onlyBump: { code: gC.code } } });

    step(rep, "6 추출 동등성");
    let tick = 0;
    const inproc = await scenario(createGuestbook({ now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() }));
    const svc = isolate(dir, "@pf/guestbook-service"); created.push(svc.tmp);
    const proc = Bun.spawn(["bun", join(svc.tmp, "pkg", "src", "main.ts")], { env: { ...process.env, ACTOR_TOKEN_SECRET: SECRET, PORT: "0" }, stdout: "pipe", stderr: "pipe" });
    let port = 0;
    try {
      const reader = proc.stdout.getReader();
      const t0 = Date.now(); let buf = "";
      while (!port && Date.now() - t0 < 10000) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); const m = buf.match(/LISTEN (\d+)/); if (m) port = Number(m[1]); }
      reader.releaseLock();
      const { createGuestbookHttpClient } = await import("./modules/guestbook-client/src/index");
      const client = createGuestbookHttpClient({ baseUrl: `http://127.0.0.1:${port}`, tokenFor: (a) => signActorToken(a, SECRET, { aud: "guestbook" }) });
      const remote = port ? await scenario(client) : [];
      const nm = join(svc.tmp, "node_modules", "@pf");
      const present = existsSync(nm) ? readdirSync(nm).sort() : [];
      const same = JSON.stringify(inproc) === JSON.stringify(remote);
      res.push({ id: 6, name: "인프로세스 = 별도 프로세스(격리 폴더, kernel·계약·guestbook 만)", pass: port > 0 && same && JSON.stringify(present) === JSON.stringify(["guestbook", "guestbook-contract", "kernel"]), detail: { port: port > 0, same, present, inprocess: same ? undefined : inproc, remote: same ? undefined : remote } });

      step(rep, "7 토큰");
      const base = `http://127.0.0.1:${port}/entries`;
      const status = async (auth?: string) => (await fetch(base, { headers: auth ? { authorization: `Bearer ${auth}` } : {} })).status;
      const good = signActorToken(actorA, SECRET, { aud: "guestbook" });
      const flip = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
      const expired = signActorToken(actorA, SECRET, { aud: "guestbook", nowMs: Date.now() - 3600_000 });
      const wrongAud = signActorToken(actorA, SECRET, { aud: "other" });
      const noneHead = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const noneTok = `${noneHead}.${good.split(".")[1]}.`;
      const st = { valid: await status(good), tampered: await status(flip), expired: await status(expired), wrongAud: await status(wrongAud), algNone: await status(noneTok), missing: await status() };
      res.push({ id: 7, name: "토큰: 유효 200 / 변조·만료·aud·alg none·없음 모두 401", pass: st.valid === 200 && [st.tampered, st.expired, st.wrongAud, st.algNone, st.missing].every((s) => s === 401), detail: st });
    } finally { proc.kill(); await proc.exited; }
  } finally { for (const p of created) rmSync(p, { recursive: true, force: true }); }
  return res;
}

async function main() {
  const all: R[][] = [];
  for (let rep = 0; rep < 3; rep++) all.push(await once(rep));
  const ids = [1, 2, 3, 4, 5, 6, 7];
  const perId = ids.map((id) => ({ id, name: all[0]!.find((x) => x.id === id)!.name, passes: all.map((run) => run.find((x) => x.id === id)?.pass ?? false) }));
  const repeat = perId.every((p) => p.passes.every(Boolean));
  const criteria = [...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })), { id: 8, name: "1~7 을 3회 반복해도 같다", pass: repeat, detail: "" }];
  const verdict = repeat ? "PASS" : "FAIL";
  mkdirSync(join(dir, "results"), { recursive: true });
  const file = join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-g11.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", "."], { cwd: dir }).stdout.toString().split("\n").filter((x) => x && !x.includes("results/") && !x.includes("node_modules")).length > 0;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, dirty, bun: Bun.version, loadavg: loadavg(), runs: all, verdict, criteria }, null, 2));
  console.log(`판정: ${verdict}`);
  for (const c of criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${c.detail}`);
  for (const run of all) for (const r of run) if (!r.pass) console.log("실패 상세:", JSON.stringify(r).slice(0, 700));
  console.log("저장:", file);
}
void appendFileSync; void sleep;
await main();
process.exit(0);
