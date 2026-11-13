// G10 스파이크 — Drizzle 마이그레이션 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다.
// 작성: AI 초안 (Authorship: G).
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sh, sleep, startPg, stopPg } from "./src/lib";

const dir = import.meta.dir;
const NAME = "g10-pg";
const PORT = 35433;
type R = { id: number; name: string; pass: boolean; detail: unknown };

const norm = (dump: string) => dump.split("\n").filter((l) => !l.startsWith("--") && !l.startsWith("\\restrict") && !l.startsWith("\\unrestrict")).join("\n").trim();
const dumpOf = (db: string) => norm(sh(`docker exec ${NAME} pg_dump -U postgres -d ${db} -s -n spike -n drizzle`).out);

// 런타임 경로: drizzle-orm/bun-sql/migrator (설계의 db:migrate 가 쓸 방식)
function migrate(work: string, url: string) {
  const r = Bun.spawnSync(["bun", "src/migrate.ts"], { cwd: work, env: { ...process.env, DATABASE_URL: url } });
  return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim().slice(-400) };
}
// CLI 경로: drizzle-kit migrate (pg 드라이버 필요)
function migrateCli(work: string, url: string) {
  const r = Bun.spawnSync(["bunx", "drizzle-kit", "migrate", "--config", "drizzle.config.ts"], { cwd: work, env: { ...process.env, DATABASE_URL: url } });
  return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim().slice(-400) };
}
async function errnoOf(p: Promise<unknown>) { try { await p; return null; } catch (e: any) { return String(e.errno ?? e.code); } }

async function once(rep: number, work: string, admin: Bun.SQL, base: ReturnType<typeof makeUrl>, observe: boolean): Promise<{ results: R[]; observation?: unknown }> {
  const a = `g10a_${rep}`, b = `g10b_${rep}`, c = `g10c_${rep}`;
  await admin.unsafe(`create database ${a}`);
  await admin.unsafe(`create database ${b}`);
  await admin.unsafe(`create database ${c}`);
  const res: R[] = [];
  let observation: unknown;

  // 1. 새 빈 DB 에 migrate
  const m1 = migrate(work, base(a));
  const A = new Bun.SQL(base(a));
  const migRows = async () => Number((await A`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n);
  const n1 = m1.code === 0 ? await migRows() : -1;
  res.push({ id: 1, name: "새 빈 DB 에 migrate 가 두 마이그레이션 적용", pass: m1.code === 0 && n1 === 2, detail: { code: m1.code, migrationRows: n1, tail: m1.code === 0 ? undefined : m1.out } });

  // 2. 부분 UNIQUE
  const idx = (await A`select indexdef from pg_indexes where schemaname='spike' and indexname='reaction_active_uq'`)[0]?.indexdef as string | undefined;
  await A`insert into spike.reaction (entry_id, actor_id, emoji) values (1, 'u1', 'heart')`;
  const dupErr = await errnoOf(A`insert into spike.reaction (entry_id, actor_id, emoji) values (1, 'u1', 'heart')`);
  await A`update spike.reaction set deleted_at = now() where entry_id = 1 and actor_id = 'u1' and emoji = 'heart'`;
  const reErr = await errnoOf(A`insert into spike.reaction (entry_id, actor_id, emoji) values (1, 'u1', 'heart')`);
  res.push({ id: 2, name: "부분 UNIQUE: WHERE 존재·활성 중복 23505·소프트 삭제 뒤 허용", pass: !!idx && /WHERE/.test(idx) && /deleted_at IS NULL/.test(idx) && dupErr === "23505" && reErr === null, detail: { indexdef: idx, dupErr, reinsertErr: reErr } });

  // 3. 부분 인덱스
  const pidx = (await A`select indexdef from pg_indexes where schemaname='spike' and indexname='outbox_pending_idx'`)[0]?.indexdef as string | undefined;
  res.push({ id: 3, name: "부분 인덱스 outbox_pending_idx", pass: !!pidx && /status = 'pending'/.test(pidx), detail: { indexdef: pidx } });

  // 4. CHECK
  const chk = await errnoOf(A`insert into spike.outbox (kind, status) values ('k', 'bogus')`);
  res.push({ id: 4, name: "CHECK 위반은 23514", pass: chk === "23514", detail: { errno: chk } });

  // 5. 보조 객체
  const c2 = new Bun.SQL(base(a));
  const first = (await A`select spike.try_leader(777) as ok`)[0].ok;
  const second = (await c2`select spike.try_leader(777) as ok`)[0].ok;
  const l = new Bun.SQL(base(a));
  const got: string[] = [];
  await l.listen("outbox", (p: string) => got.push(p));
  const ins = (await A`insert into spike.outbox (kind) values ('trg') returning id`)[0].id;
  for (let i = 0; i < 20 && got.length === 0; i++) await sleep(100);
  res.push({ id: 5, name: "try_leader 세션 락·트리거 NOTIFY", pass: first === true && second === false && got[0] === String(ins), detail: { firstSession: first, secondSession: second, notified: got, insertedId: ins } });
  await l.close(); await c2.close();

  // 6. 두 번째 새 DB 에 같은 절차 → 덤프 동일
  const m2 = migrate(work, base(b));
  const dumpA = dumpOf(a), dumpB = dumpOf(b);
  res.push({ id: 6, name: "두 번째 새 DB 의 스키마 덤프가 첫 번째와 동일", pass: m2.code === 0 && dumpA.length > 500 && dumpA === dumpB, detail: { migrateCode: m2.code, dumpBytes: dumpA.length, equal: dumpA === dumpB } });

  // 7. 멱등
  const m3 = migrate(work, base(a));
  const n3 = await migRows();
  res.push({ id: 7, name: "migrate 재실행은 이력·스키마 불변", pass: m3.code === 0 && n3 === 2 && dumpOf(a) === dumpA, detail: { code: m3.code, migrationRows: n3 } });

  // 1b·10. CLI 경로로 세 번째 새 DB 에 적용하고 덤프를 비교
  const mc = migrateCli(work, base(c));
  const C = new Bun.SQL(base(c));
  const nC = mc.code === 0 ? Number((await C`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n) : -1;
  await C.close();
  res.push({ id: 11, name: "1b. drizzle-kit migrate(CLI, pg)로도 적용", pass: mc.code === 0 && nC === 2, detail: { code: mc.code, migrationRows: nC, tail: mc.code === 0 ? undefined : mc.out } });
  res.push({ id: 10, name: "10. CLI 덤프 = 런타임 마이그레이터 덤프", pass: mc.code === 0 && dumpOf(c) === dumpA, detail: { equal: mc.code === 0 && dumpOf(c) === dumpA } });

  // 8. 관찰: 적용된 파일 수정
  if (observe) {
    appendFileSync(join(work, "drizzle", "0000_schema.sql"), '\n--> statement-breakpoint\nCREATE TABLE "spike"."tamper" (id int);\n');
    const m4 = migrate(work, base(a));
    const exists = (await A`select to_regclass('spike.tamper') as r`)[0].r;
    observation = { id: 8, name: "적용된 마이그레이션 파일을 고친 뒤 migrate", migrateCode: m4.code, tamperTableCreated: exists !== null, note: "운영 규칙 ③: 해시 검사가 없어 조용히 무시되면 code 0 이고 테이블이 생기지 않는다" };
  }
  await A.close();
  return { results: res, observation };
}

const makeUrl = (u: (db: string) => string) => u;

async function main() {
  const pg = await startPg(NAME, PORT);
  const work = mkdtempSync(join(tmpdir(), "g10-work-"));
  const all: R[][] = [];
  let observation: unknown = null;
  try {
    // 저장소 파일을 건드리지 않도록 임시 폴더에서 실행한다
    cpSync(join(dir, "drizzle"), join(work, "drizzle"), { recursive: true });
    cpSync(join(dir, "drizzle.config.ts"), join(work, "drizzle.config.ts"));
    cpSync(join(dir, "src"), join(work, "src"), { recursive: true });
    cpSync(join(dir, "package.json"), join(work, "package.json"));
    symlinkSync(join(dir, "node_modules"), join(work, "node_modules"));
    const admin = new Bun.SQL(pg.url);
    for (let rep = 0; rep < 3; rep++) {
      // DATABASE_URL 은 시험마다 migrate 가 직접 받는다
      const out = await once(rep, work, admin, makeUrl(pg.urlFor), rep === 0);
      all.push(out.results);
      if (out.observation) observation = out.observation;
      // 8 번 관찰 때 고친 파일을 되돌린다
      cpSync(join(dir, "drizzle", "0000_schema.sql"), join(work, "drizzle", "0000_schema.sql"));
    }
    await admin.close();
  } finally {
    stopPg(NAME);
    rmSync(work, { recursive: true, force: true });
  }

  const ids = [1, 11, 2, 3, 4, 5, 6, 7, 10];
  const perId = ids.map((id) => ({ id, name: all[0]!.find((x) => x.id === id)!.name, passes: all.map((run) => run.find((x) => x.id === id)!.pass) }));
  const repeat = perId.every((p) => p.passes.every(Boolean));
  const criteria = [...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })), { id: 9, name: "1~7·1b·10 을 3회 반복해도 같다", pass: repeat, detail: "" }];
  const verdict = repeat ? "PASS" : "FAIL";
  mkdirSync(join(dir, "results"), { recursive: true });
  const file = join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-g10.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, bun: Bun.version, docker: sh("docker version --format '{{.Server.Version}}'").out, drizzleKit: sh("cd " + dir + " && bunx drizzle-kit --version").out, runs: all, observation, verdict, criteria }, null, 2));
  console.log(`판정: ${verdict}`);
  for (const c of criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${c.detail}`);
  console.log("관찰(#8):", JSON.stringify(observation));
  for (const r of all[0]!) if (!r.pass) console.log("실패 상세(1회차):", JSON.stringify(r));
  console.log("저장:", file);
}
await main();
