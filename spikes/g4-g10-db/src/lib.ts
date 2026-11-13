// G4·G10 스파이크 공용 도구. 작성: AI 초안 (Authorship: G).
export const sh = (cmd: string) => { const r = Bun.spawnSync(["sh", "-c", cmd]); return { code: r.exitCode, out: (r.stdout.toString() + r.stderr.toString()).trim() }; };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startPg(name: string, port: number) {
  sh(`docker rm -f ${name} >/dev/null 2>&1`);
  const r = sh(`docker run -d --name ${name} -e POSTGRES_PASSWORD=pw -p 127.0.0.1:${port}:5432 postgres:18`);
  if (r.code !== 0) throw new Error("postgres 기동 실패: " + r.out);
  await waitReady(name, port);
  return { url: `postgres://postgres:pw@127.0.0.1:${port}/postgres`, urlFor: (db: string) => `postgres://postgres:pw@127.0.0.1:${port}/${db}` };
}
export async function waitReady(name: string, port: number, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (sh(`docker exec ${name} pg_isready -U postgres -h 127.0.0.1`).code === 0) {
      try { const c = new Bun.SQL(`postgres://postgres:pw@127.0.0.1:${port}/postgres`); await c`select 1`; await c.close(); await sleep(300); return; } catch { /* 아직 */ }
    }
    await sleep(300);
  }
  throw new Error("postgres 준비 시간 초과");
}
export const stopPg = (name: string) => sh(`docker rm -f ${name} >/dev/null 2>&1`);

/** 저장소의 마이그레이션 SQL 을 순서대로 적용한다(G4 가 G10 과 같은 스키마를 쓰기 위함. G10 은 drizzle-kit migrate 를 직접 쓴다). */
export async function applySql(url: string, dir: string) {
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan(dir))).sort();
  const sql = new Bun.SQL(url);
  for (const f of files) for (const stmt of (await Bun.file(`${dir}/${f}`).text()).split("--> statement-breakpoint")) if (stmt.trim()) await sql.unsafe(stmt);
  await sql.close();
}
