// EventTransport 계약 스위트 — 메모리·Postgres 구현이 같은 시험을 돈다. 시험 파일이 아니다(이름에 .test 없음).
// 팩토리가 `inTx` 를 함께 준다: 메모리는 가짜 tx 로 fn 을 부르고, Postgres 는 UnitOfWork 트랜잭션 안에서 부른다.
import { describe, expect, test } from "bun:test";
import {
	type EventEnvelope,
	type EventTransport,
	ValidationError,
} from "@pf/kernel";

export type TransportFixture<Tx> = {
	readonly transport: EventTransport<Tx>;
	/** `fn` 에 publish 가 쓸 `tx` 를 넘겨 부른다. fn 이 던지면 그 오류를 그대로 던진다. */
	inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
	/** 시험이 끝나면 부른다(풀·연결 정리). */
	dispose?(): Promise<void>;
};

export function envelopeOf(n: number): EventEnvelope {
	return {
		type: "test.event",
		version: 1,
		id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
		occurredAt: new Date("2026-01-01T00:00:00.000Z"),
		payload: { n },
	};
}

/** 봉투의 순번 — payload 가 unknown 이라 형식을 확인하고 꺼낸다. */
export function numberOf(envelope: EventEnvelope): number {
	const { payload } = envelope;
	if (
		typeof payload === "object" &&
		payload !== null &&
		"n" in payload &&
		typeof payload.n === "number"
	) {
		return payload.n;
	}
	throw new Error("envelopeOf 가 만든 봉투가 아니다");
}

export function runEventTransportContract<Tx>(
	name: string,
	factory: () => Promise<TransportFixture<Tx>>,
): void {
	// 시험마다 새 전달 객체를 만들고 끝나면 정리한다.
	async function withFixture(
		body: (fixture: TransportFixture<Tx>) => Promise<void>,
	): Promise<void> {
		const fixture = await factory();
		try {
			await body(fixture);
		} finally {
			await fixture.dispose?.();
		}
	}

	describe(`EventTransport 계약 — ${name}`, () => {
		test("봉투를 입력 순서대로 넘긴다", () =>
			withFixture(async ({ transport, inTx }) => {
				const seen: number[] = [];
				transport.subscribe("c1", async (envelope) => {
					seen.push(numberOf(envelope));
				});
				await inTx((tx) =>
					transport.publish([envelopeOf(1), envelopeOf(2), envelopeOf(3)], tx),
				);
				expect(seen).toEqual([1, 2, 3]);
			}));

		test("구독자 전원에게 등록 순서대로 전부 넘긴다", () =>
			withFixture(async ({ transport, inTx }) => {
				const seen: string[] = [];
				for (const consumer of ["a", "b"]) {
					transport.subscribe(consumer, async (envelope) => {
						seen.push(`${consumer}${numberOf(envelope)}`);
					});
				}
				await inTx((tx) =>
					transport.publish([envelopeOf(1), envelopeOf(2)], tx),
				);
				expect(seen).toEqual(["a1", "a2", "b1", "b2"]);
			}));

		test("receive 는 publish 에 준 tx 를 그대로 받는다", () =>
			withFixture(async ({ transport, inTx }) => {
				const received: Tx[] = [];
				transport.subscribe("c1", async (_envelope, tx) => {
					received.push(tx);
				});
				const given: Tx[] = [];
				await inTx(async (tx) => {
					given.push(tx);
					await transport.publish([envelopeOf(1)], tx);
				});
				expect(received).toHaveLength(1);
				expect(given).toHaveLength(1);
				expect(received[0]).toBe(given[0]);
			}));

		test("close 뒤에는 넘기지 않고 두 번 닫아도 된다", () =>
			withFixture(async ({ transport, inTx }) => {
				const seen: string[] = [];
				const first = transport.subscribe("c1", async () => {
					seen.push("c1");
				});
				transport.subscribe("c2", async () => {
					seen.push("c2");
				});
				first.close();
				first.close();
				await inTx((tx) => transport.publish([envelopeOf(1)], tx));
				expect(seen).toEqual(["c2"]);
			}));

		test("같은 consumer 이름의 둘째 구독은 ValidationError, 닫은 뒤에는 다시 등록할 수 있다", () =>
			withFixture(async ({ transport, inTx }) => {
				const first = transport.subscribe("c1", async () => {});
				expect(() => transport.subscribe("c1", async () => {})).toThrow(
					ValidationError,
				);
				first.close();
				const seen: string[] = [];
				transport.subscribe("c1", async () => {
					seen.push("again");
				});
				await inTx((tx) => transport.publish([envelopeOf(1)], tx));
				expect(seen).toEqual(["again"]);
			}));

		test("receive 가 던지면 그 오류가 그대로 전파되고 남은 구독자에게는 넘기지 않는다", () =>
			withFixture(async ({ transport, inTx }) => {
				const boom = new Error("receive 실패");
				const reached: string[] = [];
				transport.subscribe("a", async () => {
					throw boom;
				});
				transport.subscribe("b", async () => {
					reached.push("b");
				});
				await expect(
					inTx((tx) => transport.publish([envelopeOf(1)], tx)),
				).rejects.toBe(boom);
				expect(reached).toEqual([]);
			}));

		test("빈 봉투 목록은 아무에게도 넘기지 않는다", () =>
			withFixture(async ({ transport, inTx }) => {
				let calls = 0;
				transport.subscribe("c1", async () => {
					calls += 1;
				});
				await inTx((tx) => transport.publish([], tx));
				expect(calls).toBe(0);
			}));
	});
}
