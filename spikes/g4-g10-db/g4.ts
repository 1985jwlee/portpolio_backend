// G4 스파이크 — DB 드라이버(Bun.sql + Drizzle bun-sql) 시험. 기준은 README.md 에 시험 전에 고정한 것과 같다.
// 작성: AI 초안 (Authorship: G).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { applySql, sh, sleep, startPg, stopPg, waitReady } from "./src/lib";
import { outbox, reaction } from "./src/schema";

const dir = import.meta.dir;
const NAME = "g4-pg";
const PORT = 35434;
type R = { id: number; name: string; pass: boolean; detail: unknown };
const errno = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return String(e.errno ?? e.code); } };

async function once(rep: number): Promise<R[]> {
  const pg = await startPg(NAME, PORT);
  await applySql(pg.url, join(dir, "drizzle"));
  const res: R[] = [];
  const pool = new Bun.SQL(pg.url);
  const db = drizzle(pool);

  // 1. Drizzle bun-sql: 빌더·트랜잭션
  const ins = await db.insert(reaction).values({ entryId: 1, actorId: "a", emoji: "heart" }).returning();
  const sel = await db.select().from(reaction).where(eq(reaction.actorId, "a"));
  await db.transaction(async (tx) => { await tx.insert(outbox).values({ kind: "tx-commit" }); });
  let rolledBack = false;
  try { await db.transaction(async (tx) => { await tx.insert(outbox).values({ kind: "tx-rollback" }); throw new Error("boom"); }); } catch { rolledBack = true; }
  const nCommit = (await db.select({ n: count() }).from(outbox).where(eq(outbox.kind, "tx-commit")))[0]!.n;
  const nRollback = (await db.select({ n: count() }).from(outbox).where(eq(outbox.kind, "tx-rollback")))[0]!.n;
  res.push({ id: 1, name: "Drizzle bun-sql 빌더·트랜잭션 커밋/롤백", pass: ins.length === 1 && sel.length === 1 && nCommit === 1 && rolledBack && nRollback === 0, detail: { inserted: ins.length, selected: sel.length, committed: nCommit, rolledBackRows: nRollback } });

  // 2. LISTEN/NOTIFY 전용 연결: 100개 순서대로
  const listener = new Bun.SQL(pg.url);
  const got: string[] = [];
  await listener.listen("g4ch", (p: string) => got.push(p));
  const sender = new Bun.SQL(pg.url);
  for (let i = 1; i <= 100; i++) await sender.notify("g4ch", String(i));
  for (let i = 0; i < 50 && got.length < 100; i++) await sleep(100);
  const ordered = got.length === 100 && got.every((v, i) => v === String(i + 1));
  res.push({ id: 2, name: "LISTEN 전용 연결이 NOTIFY 100개를 순서대로 수신", pass: ordered, detail: { received: got.length, ordered } });
  await sender.close();

  // 3. 재구독: 컨테이너 재시작 뒤 새 NOTIFY 수신
  const got2: string[] = [];
  await listener.listen("g4ch2", (p: string) => got2.push(p));
  sh(`docker restart ${NAME}`);
  await waitReady(NAME, PORT);
  const t0 = Date.now();
  let recoveredSec: number | null = null;
  while (Date.now() - t0 < 30000) {
    try { const s = new Bun.SQL(pg.url); await s.notify("g4ch2", "after-restart"); await s.close(); } catch { /* 아직 */ }
    await sleep(1000);
    if (got2.length > 0) { recoveredSec = Number(((Date.now() - t0) / 1000).toFixed(1)); break; }
  }
  res.push({ id: 3, name: "컨테이너 재시작 뒤 LISTEN 자동 재구독(30초 이내)", pass: recoveredSec !== null, detail: { recoveredSec, received: got2.length } });
  await listener.close();

  // 4. SKIP LOCKED: 1000행·8워커
  await pool.unsafe(`insert into spike.outbox (kind) select 'work' from generate_series(1, 1000)`);
  const claimed: number[] = [];
  const worker = async (n: number) => {
    const c = new Bun.SQL(pg.url, { max: 1 });
    const token = `w${n}`;
    for (;;) {
      const rows = await c`WITH c AS (SELECT id FROM spike.outbox WHERE status = 'pending' AND kind = 'work' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 5)
        UPDATE spike.outbox o SET status = 'processing', owner_token = ${token}, lease_until = now() + interval '30 seconds' FROM c WHERE o.id = c.id RETURNING o.id`;
      if (rows.length === 0) break;
      const ids = rows.map((r: { id: string | number }) => Number(r.id));
      claimed.push(...ids);
      await sleep(Math.random() * 3);
      await c`UPDATE spike.outbox SET status = 'done' WHERE id IN ${c(ids)} AND owner_token = ${token}`;
    }
    await c.close();
  };
  await Promise.all(Array.from({ length: 8 }, (_, i) => worker(i)));
  const uniq = new Set(claimed).size;
  const done = Number((await pool`select count(*)::int as n from spike.outbox where kind = 'work' and status = 'done'`)[0].n);
  res.push({ id: 4, name: "SKIP LOCKED 1000행·8워커: 중복 0·누락 0", pass: claimed.length === 1000 && uniq === 1000 && done === 1000, detail: { claimedTotal: claimed.length, unique: uniq, doneInDb: done } });

  // 5. 늦은 완료 거절
  const lateId = Number((await pool`insert into spike.outbox (kind, status, owner_token, lease_until) values ('late', 'processing', 'A', now() + interval '1 second') returning id`)[0].id);
  await sleep(1500);
  const reclaimed = await pool`update spike.outbox set owner_token = 'B', lease_until = now() + interval '30 seconds' where id = ${lateId} and status = 'processing' and lease_until < now() returning id`;
  const lateA = await pool`update spike.outbox set status = 'done' where id = ${lateId} and owner_token = 'A' returning id`;
  const doneB = await pool`update spike.outbox set status = 'done' where id = ${lateId} and owner_token = 'B' returning id`;
  res.push({ id: 5, name: "임대 만료 뒤 이전 소유자의 늦은 완료는 0행", pass: reclaimed.length === 1 && lateA.length === 0 && doneB.length === 1, detail: { reclaimedByB: reclaimed.length, lateCompletionByA: lateA.length, completionByB: doneB.length } });

  // 6. 어드바이저리 리더 선출
  const insts = Array.from({ length: 8 }, () => new Bun.SQL(pg.url));
  const resv = await Promise.all(insts.map((s) => s.reserve()));
  const tries = await Promise.all(resv.map(async (r) => (await r`select pg_try_advisory_lock(4242) as ok`)[0].ok as boolean));
  const leaderIdx = tries.findIndex(Boolean);
  const winners = tries.filter(Boolean).length;
  let takeoverMs: number | null = null;
  if (winners === 1) {
    await insts[leaderIdx]!.close(); // 세션을 끊어 락을 푼다
    const t1 = Date.now();
    outer: while (Date.now() - t1 < 2000) {
      for (let i = 0; i < 8; i++) {
        if (i === leaderIdx) continue;
        if ((await resv[i]!`select pg_try_advisory_lock(4242) as ok`)[0].ok) { takeoverMs = Date.now() - t1; break outer; }
      }
      await sleep(100);
    }
  }
  res.push({ id: 6, name: "어드바이저리 락 리더 정확히 1, 리더 종료 뒤 2초 안에 승계", pass: winners === 1 && takeoverMs !== null && takeoverMs <= 2000, detail: { winners, takeoverMs } });
  for (let i = 0; i < 8; i++) if (i !== leaderIdx) await insts[i]!.close();

  // 7. SQLSTATE
  const dup = await errno(pool`insert into spike.reaction (entry_id, actor_id, emoji) values (1, 'a', 'heart')`);
  res.push({ id: 7, name: "유니크 위반 errno 가 23505", pass: dup === "23505", detail: { errno: dup } });

  await pool.close();
  stopPg(NAME);
  return res;
}

async function main() {
  const all: R[][] = [];
  try { for (let rep = 0; rep < 3; rep++) all.push(await once(rep)); } finally { stopPg(NAME); }
  const ids = [1, 2, 3, 4, 5, 6, 7];
  const perId = ids.map((id) => ({ id, name: all[0]!.find((x) => x.id === id)!.name, passes: all.map((run) => run.find((x) => x.id === id)!.pass) }));
  const repeat = perId.every((p) => p.passes.every(Boolean));
  const criteria = [...perId.map((p) => ({ id: p.id, name: p.name, pass: p.passes.every(Boolean), detail: `3회: ${p.passes.map((x) => (x ? "PASS" : "FAIL")).join(" ")}` })), { id: 8, name: "1~7 을 3회 반복해도 같다(반복마다 새 컨테이너)", pass: repeat, detail: "" }];
  const verdict = repeat ? "PASS" : "FAIL";
  mkdirSync(join(dir, "results"), { recursive: true });
  const file = join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-g4.json`);
  const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir }).stdout.toString().trim();
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), commit: git || null, bun: Bun.version, docker: sh("docker version --format '{{.Server.Version}}'").out, runs: all, verdict, criteria }, null, 2));
  console.log(`판정: ${verdict}`);
  for (const c of criteria) console.log(`${c.pass ? "PASS" : "FAIL"}  #${c.id} ${c.name}  ${c.detail}`);
  for (const run of all) for (const r of run) if (!r.pass) console.log("실패 상세:", JSON.stringify(r));
  console.log("재구독 소요(초):", all.map((run) => (run.find((x) => x.id === 3)!.detail as { recoveredSec: number | null }).recoveredSec).join(", "));
  console.log("저장:", file);
}
await main();
process.exit(0);
