// PresenceCounter — 계약 스위트를 운영 메모리 구현과 testkit 대역에 돌린다.
import { FakePresenceCounter } from "@pf/testkit";
import { MemoryPresenceCounter } from "../src/index.ts";
import { runPresenceCounterContract } from "./contract/presence-counter.contract.ts";

runPresenceCounterContract(
	"MemoryPresenceCounter",
	() => new MemoryPresenceCounter(),
);
runPresenceCounterContract(
	"FakePresenceCounter",
	() => new FakePresenceCounter(),
);
