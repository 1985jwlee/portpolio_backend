// G11 추출 게이트(ADR-052 결정 5): 임포트 규칙 검사와 계약 버전 검사. 작성: AI 초안 (Authorship: G).
// 사용: bun tools/gate.ts imports <root> | version <root> | lock <root>
// 한계: dependency-cruiser 가 아니라 정규식 스캔이다(동적 경로·템플릿 임포트는 못 본다). 워크스페이스 링크는 선언 안 한 패키지도 해석해 주므로 이 정적 검사가 필요하다.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

type Kind = "kernel" | "contract" | "module" | "app";
type Pkg = { dir: string; name: string; version: string; kind: Kind; deps: Set<string> };

function packages(root: string): Pkg[] {
  const out: Pkg[] = [];
  for (const [group, kinds] of [["packages", null], ["modules", null], ["apps", "app"]] as const) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      const dir = join(base, d);
      if (!existsSync(join(dir, "package.json"))) continue;
      const j = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const kind: Kind = kinds ?? (group === "packages" ? "kernel" : j.name.endsWith("-contract") ? "contract" : "module");
      out.push({ dir, name: j.name, version: j.version, kind, deps: new Set(Object.keys({ ...j.dependencies, ...j.devDependencies })) });
    }
  }
  return out;
}
function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => { for (const e of readdirSync(p)) { const f = join(p, e); if (statSync(f).isDirectory()) { if (e !== "node_modules") walk(f); } else if (f.endsWith(".ts")) out.push(f); } };
  if (existsSync(join(dir, "src"))) walk(join(dir, "src"));
  return out;
}
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

function checkImports(root: string): string[] {
  const v: string[] = [];
  for (const p of packages(root)) {
    for (const f of sources(p.dir)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1]!;
        const where = `${relative(root, f)} → ${spec}`;
        if (spec.startsWith(".")) {
          const target = resolve(dirname(f), spec);
          if (relative(p.dir, target).startsWith("..")) v.push(`G-c ${where} (패키지 밖 상대 경로)`);
          continue;
        }
        if (spec.startsWith("node:") || spec === "bun") { if (p.kind === "contract") v.push(`G-d ${where} (계약은 런타임 내장도 임포트하지 않는다)`); continue; }
        const isPf = spec.startsWith("@pf/");
        if (p.kind === "kernel") { v.push(`G-e ${where} (kernel 은 아무것도 임포트하지 않는다)`); continue; }
        if (p.kind === "contract" && spec !== "@pf/kernel") { v.push(`G-d ${where} (계약은 kernel 만 임포트)`); continue; }
        if (isPf) {
          if (spec !== p.name && !p.deps.has(spec)) v.push(`G-a ${where} (package.json 에 선언하지 않은 의존)`);
          if (p.kind === "module" && spec !== "@pf/kernel" && !spec.endsWith("-contract")) v.push(`G-b ${where} (모듈은 다른 모듈의 구현이 아니라 계약만 임포트)`);
        }
      }
    }
  }
  return v;
}

const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
const semver = (s: string) => s.split(".").map(Number) as [number, number, number];
const greater = (a: string, b: string) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! > y[i]!; return false; };
async function contractHash(dir: string) { const { schemas } = await import(join(dir, "src", "schemas.ts")); return createHash("sha256").update(JSON.stringify(canon(schemas))).digest("hex"); }

async function checkVersion(root: string, write: boolean): Promise<string[]> {
  const v: string[] = [];
  for (const p of packages(root).filter((x) => x.kind === "contract")) {
    const lockFile = join(p.dir, "contract.lock.json");
    const hash = await contractHash(p.dir);
    if (write) { writeFileSync(lockFile, JSON.stringify({ version: p.version, hash }, null, 2) + "\n"); continue; }
    if (!existsSync(lockFile)) { v.push(`V-0 ${p.name}: contract.lock.json 없음`); continue; }
    const lock = JSON.parse(readFileSync(lockFile, "utf8")) as { version: string; hash: string };
    if (hash !== lock.hash && !greater(p.version, lock.version)) v.push(`V-1 ${p.name}: 계약이 바뀌었는데 버전이 오르지 않음 (잠금 ${lock.version}, 현재 ${p.version})`);
  }
  return v;
}

const [cmd, root] = [process.argv[2], resolve(process.argv[3] ?? ".")];
if (cmd === "imports") { const v = checkImports(root); console.log(v.length ? v.join("\n") : "OK imports"); process.exit(v.length ? 1 : 0); }
else if (cmd === "version") { const v = await checkVersion(root, false); console.log(v.length ? v.join("\n") : "OK version"); process.exit(v.length ? 1 : 0); }
else if (cmd === "lock") { await checkVersion(root, true); console.log("locked"); }
else { console.error("usage: gate.ts imports|version|lock <root>"); process.exit(2); }
