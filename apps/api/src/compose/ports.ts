// api 가 쓰는 포트 구현 묶음 — 어떤 구현을 꽂는지 정하는 유일한 자리(조립, F16 §9.3 4단계).
// 이번 행은 usecase 가 없어 묶음을 만들기만 한다. 첫 usecase 가 이 묶음을 받는다.
import {
	type DbPool,
	PostgresUnitOfWork,
	type TxContext,
	type UnitOfWork,
} from "@pf/db";
import { PostgresAuditWriter } from "@pf/events/adapter/postgres/audit-writer";
import type { AuditWriter, Clock, Faults, IdGenerator } from "@pf/kernel";

export type ApiPorts = {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly faults: Faults;
	readonly uow: UnitOfWork;
	readonly audit: AuditWriter<TxContext>;
};

export function createApiPorts(deps: {
	readonly pool: DbPool;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly faults: Faults;
}): ApiPorts {
	return {
		clock: deps.clock,
		ids: deps.ids,
		faults: deps.faults,
		uow: new PostgresUnitOfWork(deps.pool, deps.clock),
		audit: new PostgresAuditWriter(deps.faults),
	};
}
