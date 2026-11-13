// G11 kernel: 아무것도 임포트하지 않는 가장 안정된 층. 작성: AI 초안 (Authorship: G).
import { createHmac, timingSafeEqual } from "node:crypto";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** 엔트리포인트가 세션 쿠키를 풀어 모듈에 주입하는 값(ADR-052 결정 4). 모듈은 identity 를 호출하지 않는다. */
export type ActorContext = { actorKey: string; kind: "anonymous" | "user"; roles: string[] };

const b64u = (v: Buffer | string) => Buffer.from(v).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();

/** 모듈을 서비스로 뗄 때 쓰는 직렬화: 짧은 수명의 HS256 서명 토큰(JWT 형식, 수작업 구현). 브라우저에는 노출하지 않는다. */
export function signActorToken(actor: ActorContext, secret: string, o: { aud: string; ttlSec?: number; nowMs?: number }): string {
  const now = Math.floor((o.nowMs ?? Date.now()) / 1000);
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ sub: actor.actorKey, kind: actor.kind, roles: actor.roles, iss: "edge", aud: o.aud, iat: now, exp: now + (o.ttlSec ?? 60) }));
  return `${h}.${p}.${b64u(mac(secret, `${h}.${p}`))}`;
}

export function verifyActorToken(token: string, secret: string, o: { aud: string; nowMs?: number }): Result<ActorContext, string> {
  const parts = token.split(".");
  if (parts.length !== 3) return err("malformed");
  const [h, p, s] = parts as [string, string, string];
  try {
    const head = JSON.parse(Buffer.from(h, "base64url").toString());
    if (head.alg !== "HS256") return err("alg");
    const expect = mac(secret, `${h}.${p}`);
    const got = Buffer.from(s, "base64url");
    if (got.length !== expect.length || !timingSafeEqual(got, expect)) return err("signature");
    const c = JSON.parse(Buffer.from(p, "base64url").toString());
    if (c.iss !== "edge" || c.aud !== o.aud) return err("claims");
    if (!(c.exp > Math.floor((o.nowMs ?? Date.now()) / 1000))) return err("expired");
    return ok({ actorKey: String(c.sub), kind: c.kind, roles: Array.isArray(c.roles) ? c.roles.map(String) : [] });
  } catch { return err("malformed"); }
}
