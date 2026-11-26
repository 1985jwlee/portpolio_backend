// raw SQL 레지스트리(ADR-025) — 같은 트랜잭션에서 보내는 NOTIFY.
// 탈출 사유: Drizzle 빌더에 NOTIFY 가 없고 `NOTIFY` 문은 바인드 매개변수를 못 받는다 → `pg_notify(채널, 페이로드)` 를 쓴다.
// 신호는 커밋 때 전달되고 롤백이면 사라진다 — 구독자가 "저장된 것"만 깨어나 읽는다.
import { ValidationError } from "@pf/kernel";
import { sql } from "drizzle-orm";
import type { TxContext } from "../../../unit-of-work.ts";

// 채널 이름은 식별자 모양만 받는다(roles-spec.ts 의 이름 규칙과 같은 정규식).
const CHANNEL_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** `tx` 의 트랜잭션에서 `pg_notify` 한다. 채널·페이로드는 바인드 인자라 문자열 결합이 없다. */
export async function notify(
	tx: TxContext,
	channel: string,
	payload: string,
): Promise<void> {
	if (!CHANNEL_PATTERN.test(channel)) {
		throw new ValidationError({
			message: "NOTIFY 채널 이름은 ^[a-z_][a-z0-9_]*$ 이어야 한다",
			details: { channel },
		});
	}
	await tx.db.execute(sql`select pg_notify(${channel}, ${payload})`);
}
