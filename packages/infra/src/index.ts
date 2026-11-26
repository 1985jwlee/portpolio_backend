// 공개 표면 — 이 파일이 infra 가 내보내는 이름의 유일한 목록이다. `export *` 를 쓰지 않는다.
// 이 패키지는 조립 루트(`apps/*/src/compose/`)에서만 임포트한다(B10).

export { AesGcmFieldCipher } from "./crypto/aes-gcm-field-cipher.ts";
export type { Keyring } from "./crypto/keyring.ts";
export { parseKeyring } from "./crypto/keyring.ts";
export type { Component, LifecycleLog } from "./lifecycle/component.ts";
export {
	ExitCodeError,
	exitCodeOf,
} from "./lifecycle/component.ts";
export { CompositionRoot } from "./lifecycle/composition-root.ts";
export { DbPoolComponent } from "./lifecycle/db-pool-component.ts";
export { EXIT_CODES } from "./lifecycle/exit-codes.ts";
export type { HttpServerOptions } from "./lifecycle/http-server-component.ts";
export { HttpServerComponent } from "./lifecycle/http-server-component.ts";
export { runRoot } from "./lifecycle/run-root.ts";
export type { ShutdownOptions } from "./lifecycle/shutdown-coordinator.ts";
export { ShutdownCoordinator } from "./lifecycle/shutdown-coordinator.ts";
export {
	ConfigComponent,
	ReadinessComponent,
} from "./lifecycle/simple-components.ts";
export { MemoryEventTransport } from "./memory/memory-event-transport.ts";
export { MemoryKeyValueCache } from "./memory/memory-key-value-cache.ts";
export { MemoryPresenceCounter } from "./memory/memory-presence-counter.ts";
export { MemoryRateLimiter } from "./memory/memory-rate-limiter.ts";
export {
	INBOX_NOTIFY_CHANNEL,
	PostgresEventTransport,
} from "./postgres/postgres-event-transport.ts";
export { NoopFaults } from "./system/noop-faults.ts";
export { SystemClock } from "./system/system-clock.ts";
export { UuidV7Generator } from "./system/uuid-v7-generator.ts";
