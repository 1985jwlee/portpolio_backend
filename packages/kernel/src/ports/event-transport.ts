import type { Instant, Uuid } from "../domain.ts";

/** 전달 계층이 보는 최소 봉투. 종류별 payload 의 형식은 이벤트를 소유한 모듈의 계약이다. */
export type EventEnvelope = {
	readonly type: string;
	readonly version: number;
	readonly id: Uuid;
	readonly occurredAt: Instant;
	readonly payload: unknown;
};

/** 구독자가 봉투를 받는 함수. `tx` 는 `publish` 호출자의 트랜잭션이다 — 구독자의 저장이 그 트랜잭션과 함께 커밋·롤백된다. */
export type Receive<Tx> = (envelope: EventEnvelope, tx: Tx) => Promise<void>;

export interface Subscription {
	/** 구독을 끊는다. 이미 끊었으면 무시한다. */
	close(): void;
}

/**
 * 디스패처가 선점한 이벤트를 구독자에게 넘기는 단계. `Tx` 는 구현이 정한다 — 포트는 해석하지 않고 그대로 넘긴다.
 * 구현은 이 패키지 밖에 둔다.
 */
export interface EventTransport<Tx> {
	/** 구독자마다(등록 순서) 봉투를 입력 순서대로 `receive` 에 넘긴다. `receive` 가 던지면 그대로 전파한다. */
	publish(envelopes: readonly EventEnvelope[], tx: Tx): Promise<void>;
	/** 같은 `consumer` 이름을 두 번 등록하면 `ValidationError` 를 던진다. */
	subscribe(consumer: string, receive: Receive<Tx>): Subscription;
}
