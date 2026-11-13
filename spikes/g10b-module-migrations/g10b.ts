// G10b 스파이크 — 모듈별 마이그레이션 소유 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다.
// 작성: AI 초안 (Authorship: G).
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { sh, sleep, startPg, stopPg } from "./src/lib";

const dir = import.meta.dir;
const NAME = "g10b-pg";
const PORT = 35435;
const MODS = ["alpha", "beta", "gamma"] as const;
type R = { id: number; name: string; pass: boolean; detail: unknown };
const step = (rep: number, s: string) => console.error(`[rep ${rep}] ${new Date().toISOString().slice(11, 19)} ${s}`);

const norm = (d: string) => d.split("\n").filter((l) => !l.startsWith("--") && !l.startsWith("\\restrict") && !l.startsWith("\\unrestrict")).join("\n").trim();
const dumpOf = (db: string, schemas: readonly string[]) => norm(sh(`docker exec ${NAME} pg_dump -U postgres -d ${db} -s ${schemas.map((s) => `-n ${s}`).join(" ")}`).out);
const errno = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return String(e.errno ?? e.code); } };
const perms = <T,>(a: readonly T[]): T[][] => (a.length <= 1 ? [[...a]] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

function migrate(root: string, mod: string, url: string, shared = false) {
  const r = Bun.spawnSync(["bun", join(root, "src", "migrate.ts")], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, MODULE: mod, MIGRATIONS: join(root, "modules", mod, "migrations"), SHARED: shared ? "1" : "0" },
  });
  return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim().slice(-300) };
}
const hist = async (url: string, mod: string) => { const s = new Bun.SQL(url); try { return Number((await s.unsafe(`select count(*)::int as n from pf_migrations."${mod}"`))[0].n); } catch { return -1; } finally { await s.close(); } };

/** 임시 프로젝트: src/migrate.ts + 지정한 모듈 폴더만 복사하고 node_modules 를 연결한다. */
function tempProject(mods: readonly string[], withKitConfig = false) {
  const work = mkdtempSync(join(tmpdir(), "g10b-work-"));
  mkdirSync(join(work, "src"));
  cpSync(join(dir, "src", "migrate.ts"), join(work, "src", "migrate.ts"));
  cpSync(join(dir, "package.json"), join(work, "package.json"));
  for (const m of mods) cpSync(join(dir, "modules", m), join(work, "modules", m), { recursive: true });
  symlinkSync(join(dir, "node_modules"), join(work, "node_modules"));
  void withKitConfig;
  return work;
}

function staticIsolation(): R {
  const hits: string[] = [];
  for (const m of MODS) {
    const folder = join(dir, "modules", m, "migrations");
    const files = [...readdirSync(folder).filter((f) => f.endsWith(".sql")).map((f) => join(folder, f)), ...readdirSync(join(folder, "meta")).map((f) => join(folder, "meta", f))];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const other of MODS) if (other !== m && (text.includes(`"${other}"`) || text.includes(`${other}.`))) hits.push(`${m}: ${f.slice(dir.length + 1)} → ${other}`);
    }
  }
  return { id: 1, name: "모듈 마이그레이션이 다른 모듈 스키마 이름을 참조하지 않음(정적)", pass: hits.length === 0, detail: { hits } };
}

async function once(rep: number, admin: Bun.SQL, urlFor: (db: string) => string): Promise<{ results: R[]; observation?: unknown }> {
  const res: R[] = [];
  const mk = async (n: string) => { await admin.unsafe(`create database ${n}`); return urlFor(n); };
  const main = `g10b_${rep}_main`;
  const mainUrl = await mk(main);

  step(rep, "2 모듈별 적용");
  const codes = MODS.map((m) => migrate(dir, m, mainUrl));
  const counts = await Promise.all(MODS.map((m) => hist(mainUrl, m)));
  const A = new Bun.SQL(mainUrl);
  const drizzleTables = Number((await A`select count(*)::int as n from information_schema.tables where table_schema = 'drizzle'`)[0].n);
  res.push({ id: 2, name: "모듈별 폴더·이력 표 적용: 코드 0, 모듈마다 이력 2행, 기본 이력 표 없음", pass: codes.every((c) => c.code === 0) && counts.every((n) => n === 2) && drizzleTables === 0, detail: { codes: codes.map((c) => c.code), counts, drizzleTables, tail: codes.find((c) => c.code !== 0)?.out } });
  const fullDump = dumpOf(main, MODS);
  const modDump = Object.fromEntries(MODS.map((m) => [m, dumpOf(main, [m])])) as Record<(typeof MODS)[number], string>;

  step(rep, "3 순서 불변");
  const order: { order: string; codes: number[]; equal: boolean }[] = [];
  let i = 0;
  for (const p of perms(MODS)) {
    const db = `g10b_${rep}_p${i++}`;
    const u = await mk(db);
    const cs = p.map((m) => migrate(dir, m, u).code);
    order.push({ order: p.join(">"), codes: cs, equal: cs.every((c) => c === 0) && dumpOf(db, MODS) === fullDump });
  }
  res.push({ id: 3, name: "6가지 적용 순서의 전체 덤프가 바이트 동일", pass: fullDump.length > 800 && order.length === 6 && order.every((o) => o.equal), detail: { dumpBytes: fullDump.length, order } });

  step(rep, "6 객체 동작");
  const aDup = (async () => {
    await A`insert into alpha.item (entry_id, actor_id) values (1, 'u')`;
    const dup = await errno(A`insert into alpha.item (entry_id, actor_id) values (1, 'u')`);
    await A`update alpha.item set deleted_at = now() where entry_id = 1 and actor_id = 'u'`;
    const re = await errno(A`insert into alpha.item (entry_id, actor_id) values (1, 'u')`);
    return { dup, re };
  })();
  const { dup, re } = await aDup;
  const chk = await errno(A`insert into beta.ledger_line (status, amount) values ('bogus', 1)`);
  const l = new Bun.SQL(mainUrl);
  const got: string[] = [];
  await l.listen("gamma_outbox", (p: string) => got.push(p));
  const gid = (await A`insert into gamma.outbox (kind) values ('x') returning id`)[0].id;
  for (let k = 0; k < 20 && got.length === 0; k++) await sleep(100);
  await l.close();
  res.push({ id: 6, name: "객체 동작: alpha 23505·소프트 삭제 뒤 허용 / beta 23514 / gamma NOTIFY", pass: dup === "23505" && re === null && chk === "23514" && got[0] === String(gid), detail: { dup, reinsert: re, chk, notified: got, insertedId: gid } });

  step(rep, "7 멱등");
  const again = MODS.map((m) => migrate(dir, m, mainUrl));
  const counts2 = await Promise.all(MODS.map((m) => hist(mainUrl, m)));
  res.push({ id: 7, name: "전 모듈 재적용: 코드 0, 이력·전체 덤프 불변", pass: again.every((c) => c.code === 0) && counts2.every((n) => n === 2) && dumpOf(main, MODS) === fullDump, detail: { codes: again.map((c) => c.code), counts: counts2 } });

  step(rep, "4 부분 재적용 격리");
  const work4 = tempProject(MODS);
  let c4: R;
  try {
    const gen = Bun.spawnSync(["bunx", "drizzle-kit", "generate", "--custom", "--name=extra", "--config", "modules/beta/drizzle.config.ts"], { cwd: work4 });
    const extra = readdirSync(join(work4, "modules", "beta", "migrations")).find((f) => f.endsWith("_extra.sql"));
    if (gen.exitCode !== 0 || !extra) c4 = { id: 4, name: "부분 재적용 격리", pass: false, detail: { genCode: gen.exitCode, tail: (gen.stdout.toString() + gen.stderr.toString()).slice(-300) } };
    else {
      appendFileSync(join(work4, "modules", "beta", "migrations", extra), '\nCREATE INDEX "ledger_line_amount_idx" ON "beta"."ledger_line" ("amount");\n');
      const m = migrate(work4, "beta", mainUrl);
      const [cb, ca, cg] = await Promise.all([hist(mainUrl, "beta"), hist(mainUrl, "alpha"), hist(mainUrl, "gamma")]);
      const betaNow = dumpOf(main, ["beta"]);
      const pass = m.code === 0 && cb === 3 && ca === 2 && cg === 2 && betaNow !== modDump.beta && betaNow.includes("ledger_line_amount_idx") && dumpOf(main, ["alpha"]) === modDump.alpha && dumpOf(main, ["gamma"]) === modDump.gamma;
      c4 = { id: 4, name: "beta 에 세 번째 마이그레이션을 더해 beta 만 적용: beta 3행·덤프 변경, alpha·gamma 불변", pass, detail: { code: m.code, counts: { beta: cb, alpha: ca, gamma: cg }, betaChanged: betaNow !== modDump.beta } };
    }
  } finally { rmSync(work4, { recursive: true, force: true }); }
  res.push(c4);

  step(rep, "5 단독 적용");
  const work5 = tempProject(["beta"]);
  let c5: R;
  try {
    const u = await mk(`g10b_${rep}_solo`);
    const m = migrate(work5, "beta", u);
    const n = await hist(u, "beta");
    c5 = { id: 5, name: "beta 폴더만 있는 임시 프로젝트에서 단독 적용: 성공·beta 덤프 동일", pass: m.code === 0 && n === 2 && dumpOf(`g10b_${rep}_solo`, ["beta"]) === modDump.beta, detail: { code: m.code, historyRows: n, tail: m.code === 0 ? undefined : m.out } };
  } finally { rmSync(work5, { recursive: true, force: true }); }
  res.push(c5);
  await A.close();

  let observation: unknown;
  if (rep === 0) {
    step(rep, "9 관찰: 공유 기본 이력 표, 생성 시각 역순");
    const u = await mk(`g10b_${rep}_shared`);
    const cs = (["gamma", "beta", "alpha"] as const).map((m) => ({ module: m, ...migrate(dir, m, u, true) }));
    const s = new Bun.SQL(u);
    const tables = (await s`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('alpha','beta','gamma') order by 1`).map((r: { t: string }) => r.t);
    const rows = Number((await s`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n);
    await s.close();
    observation = { id: 9, name: "기본 이력 표 공유 + 생성 시각 역순 적용", order: "gamma>beta>alpha", exitCodes: cs.map((c) => `${c.module}:${c.code}`), tablesCreated: tables, sharedHistoryRows: rows, tails: cs.filter((c) => c.code !== 0).map((c) => `${c.module}: ${c.out}`) };
  }
  return { results: res, observation };
}

async function main() {
  const pg = await startPg(NAME, PORT);
  const all: R[][] = [];
  let observation: unknown = null;
  try {
    const admin = new Bun.SQL(pg.url);
    for (let rep = 0; rep < 3; rep++) {
      const out = await once(rep, admin, pg.urlFor);
      all.push(out.results);
      if (out.observation) observation = out.observation;
    }
    await admin.close();
  } finally { stopPg(NAME); }

  const static1 = staticIsolation();
  const ids = [2, 3, 4, 5, 6, 7];
  const perId = ids.map((id) => ({ id, name: all[0]!.find((x) => x.id === id)!.name, passes: all.map((run) => run.find((x) => x.id === id)!.pass) }));
  const repeat = static1.pass && perId.every((p) => p.passes.every(Boolean));
  const criteria = [
    { id: 1, name: static1.name, pass: static1.pass, detail: JSON.stringify(static1.detail) },
    ...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })),
    { id: 8, name: "1~7 을 3회 반복해도 같다(반복마다 새 DB)", pass: repeat, detail: "" },
  ];
  const verdict = repeat ? "PASS" : "FAIL";
  mkdirSync(join(dir, "results"), { recursive: true });
  const file = join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-g10b.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", "."], { cwd: dir }).stdout.toString().split("\n").filter((x) => x && !x.includes("results/")).length > 0;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, dirty, bun: Bun.version, docker: sh("docker version --format '{{.Server.Version}}'").out, drizzleKit: sh(`cd ${dir} && bunx drizzle-kit --version`).out, loadavg: loadavg(), static1, runs: all, observation, verdict, criteria }, null, 2));
  console.log(`판정: ${verdict}`);
  for (const c of criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${c.detail}`);
  console.log("관찰(#9):", JSON.stringify(observation));
  for (const run of all) for (const r of run) if (!r.pass) console.log("실패 상세:", JSON.stringify(r));
  console.log("저장:", file);
}
await main();
process.exit(0);
