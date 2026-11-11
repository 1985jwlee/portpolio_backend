// G11 guestbook 구현(메모리). 다른 모듈의 구현을 임포트하지 않고 kernel·자기 계약만 쓴다. 작성: AI 초안 (Authorship: G).
import { err, ok, type ActorContext, type Result } from "@pf/kernel";
import { type EntryDto, type GuestbookPort, type PostError, schemas, validate } from "@pf/guestbook-contract";

export function createGuestbook(o: { now: () => string }): GuestbookPort {
  const rows: { id: number; body: string; createdAt: string; ownerKey: string }[] = [];
  const toDto = (r: (typeof rows)[number], actor: ActorContext): EntryDto => ({ id: r.id, body: r.body, createdAt: r.createdAt, mine: r.ownerKey === actor.actorKey });
  return {
    async postEntry(actor, body): Promise<Result<EntryDto, PostError>> {
      const bad = validate(schemas.EntryDto.properties.body, body);
      if (bad) return err("invalid_body");
      const row = { id: rows.length + 1, body, createdAt: o.now(), ownerKey: actor.actorKey };
      rows.push(row);
      return ok(toDto(row, actor));
    },
    async listEntries(actor) { return rows.slice().reverse().map((r) => toDto(r, actor)); },
  };
}
