// EventTransport(L2) — 계약 스위트를 운영 메모리 구현과 testkit 대역에 돌린다. Postgres 구현은 test/integration/ 에서 같은 스위트를 돈다.
import { InMemoryEventTransport } from "@pf/testkit";
import { MemoryEventTransport } from "../src/index.ts";
import { runEventTransportContract } from "./contract/event-transport.contract.ts";

// 메모리 구현은 tx 를 해석하지 않는다 — 식별만 되는 객체를 가짜 tx 로 쓴다.
runEventTransportContract("MemoryEventTransport", async () => ({
	transport: new MemoryEventTransport<object>(),
	inTx: (fn) => fn({}),
}));
runEventTransportContract("InMemoryEventTransport(testkit)", async () => ({
	transport: new InMemoryEventTransport<object>(),
	inTx: (fn) => fn({}),
}));
