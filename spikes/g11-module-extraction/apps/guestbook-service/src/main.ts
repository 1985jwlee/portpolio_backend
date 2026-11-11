// G11 분리된 guestbook 서비스 엔트리: 서명 토큰을 ActorContext 로 복원해 구현을 호출한다. 작성: AI 초안 (Authorship: G).
import { verifyActorToken } from "@pf/kernel";
import { schemas, validate } from "@pf/guestbook-contract";
import { createGuestbook } from "@pf/guestbook";

const secret = process.env.ACTOR_TOKEN_SECRET!;
let tick = 0;
const gb = createGuestbook({ now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() });
const json = (s: number, v: unknown) => new Response(JSON.stringify(v), { status: s, headers: { "content-type": "application/json" } });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 0),
  hostname: "127.0.0.1",
  async fetch(req) {
    const auth = req.headers.get("authorization") ?? "";
    const v = verifyActorToken(auth.startsWith("Bearer ") ? auth.slice(7) : "", secret, { aud: "guestbook" });
    if (!v.ok) return json(401, { error: "unauthorized" });
    const url = new URL(req.url);
    if (url.pathname !== "/entries") return json(404, { error: "not_found" });
    if (req.method === "GET") return json(200, await gb.listEntries(v.value));
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (validate(schemas.PostEntryRequest as never, body)) return json(400, { error: "invalid_body" });
      const r = await gb.postEntry(v.value, (body as { body: string }).body);
      return r.ok ? json(201, r.value) : json(400, { error: r.error });
    }
    return json(405, { error: "method" });
  },
});
console.log(`LISTEN ${server.port}`);
