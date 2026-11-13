// G11 guestbook HTTP 클라이언트 어댑터: 같은 GuestbookPort 계약을 네트워크 너머로 만족한다. 작성: AI 초안 (Authorship: G).
import { err, ok, type ActorContext } from "@pf/kernel";
import { type EntryDto, type GuestbookPort, schemas, validate } from "@pf/guestbook-contract";

export function createGuestbookHttpClient(o: { baseUrl: string; tokenFor: (actor: ActorContext) => string }): GuestbookPort {
  const headers = (a: ActorContext) => ({ authorization: `Bearer ${o.tokenFor(a)}`, "content-type": "application/json" });
  const check = (e: unknown): EntryDto => { const bad = validate(schemas.EntryDto as never, e); if (bad) throw new Error(`계약 위반 응답: ${bad}`); return e as EntryDto; };
  return {
    async postEntry(actor, body) {
      const r = await fetch(`${o.baseUrl}/entries`, { method: "POST", headers: headers(actor), body: JSON.stringify({ body }) });
      if (r.status === 400) return err("invalid_body");
      if (r.status !== 201) throw new Error(`예상 밖 상태 ${r.status}`);
      return ok(check(await r.json()));
    },
    async listEntries(actor) {
      const r = await fetch(`${o.baseUrl}/entries`, { headers: headers(actor) });
      if (r.status !== 200) throw new Error(`예상 밖 상태 ${r.status}`);
      return ((await r.json()) as unknown[]).map(check);
    },
  };
}
