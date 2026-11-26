// Postgres 전달 — 디스패처가 연 트랜잭션 안에서 구독자의 `receive` 를 부르고(그 안에서 구독 모듈이 inbox 에 쓴다),
// 같은 트랜잭션에서 NOTIFY 를 보내 러너를 깨운다. 그래서 inbox 저장·신호가 디스패처 트랜잭션과 함께 커밋·롤백된다(F16 §10.2).
// 이 어댑터는 표를 소유하지 않는다 — outbox 읽기는 디스패처(S3-3), inbox 쓰기는 구독 모듈의 ReceiveMessage(S3-4)의 몫이다.
// SQL 도 직접 쓰지 않는다: NOTIFY 는 db 의 raw 함수가, 행 쓰기는 구독자의 `receive` 가 한다(B11).
import { notify, type TxContext } from "@pf/db";
import type {
	EventEnvelope,
	EventTransport,
	Receive,
	Subscription,
} from "@pf/kernel";
import { SubscriptionRegistry } from "../memory/subscription-registry.ts";

/** 구독자 inbox 에 새 행이 생겼다는 신호의 채널. 페이로드는 consumer 이름이다(F13 §3.6). */
export const INBOX_NOTIFY_CHANNEL = "inbox_new";

export class PostgresEventTransport implements EventTransport<TxContext> {
	readonly #registry = new SubscriptionRegistry<TxContext>();

	subscribe(consumer: string, receive: Receive<TxContext>): Subscription {
		return this.#registry.add(consumer, receive);
	}

	/**
	 * `tx` 가 곧 호출자의 트랜잭션이다 — 풀의 다른 연결을 쓰면 롤백돼도 inbox 행이 남는다.
	 * `receive` 가 던지면 그대로 전파한다(롤백은 호출자의 UnitOfWork 몫).
	 */
	publish(envelopes: readonly EventEnvelope[], tx: TxContext): Promise<void> {
		return this.#registry.deliver(envelopes, tx, (consumer) =>
			notify(tx, INBOX_NOTIFY_CHANNEL, consumer),
		);
	}
}
