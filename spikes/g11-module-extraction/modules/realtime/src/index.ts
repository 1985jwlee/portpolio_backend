// G11 realtime(소비자): guestbook 의 구현이 아니라 계약 포트만 안다. 작성: AI 초안 (Authorship: G).
import type { ActorContext } from "@pf/kernel";
import type { GuestbookPort } from "@pf/guestbook-contract";

export async function buildSnapshot(port: GuestbookPort, actor: ActorContext) {
  const entries = await port.listEntries(actor);
  return { count: entries.length, latest: entries[0]?.body ?? null, mine: entries.filter((e) => e.mine).length };
}
