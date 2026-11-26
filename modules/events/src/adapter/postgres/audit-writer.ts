// 감사 행 쓰기 — 호출자의 트랜잭션(`tx`)에 `events.audit_log` 한 행을 추가한다. 별도 연결·트랜잭션을 열지 않는다.
// 읽기·보관 정리·"별도 짧은 tx 로 남기는 거절(denied)" 의 tx 열기는 이 파일의 책임이 아니다(호출 usecase 몫).
import type { TxContext } from "@pf/db";
import type { AuditEntry, AuditWriter, Faults } from "@pf/kernel";
import { DetailValidator } from "../../audit/detail-validator.ts";
import { auditLog } from "./schema.ts";

/**
 * 행이 들어간 직후의 장애 주입 지점. 이름의 정본은 testkit 의 `FAULT_POINTS` 인데 운영 코드는 testkit 을
 * 임포트할 수 없어 같은 문자열을 여기에 둔다 — 갈라지면 `test/audit-writer.test.ts` 가 실패한다.
 */
export const AUDIT_WRITER_AFTER_RECORD = "events.audit_writer.after_record";

export class PostgresAuditWriter implements AuditWriter<TxContext> {
	readonly #faults: Faults;
	readonly #validator: DetailValidator;

	constructor(
		faults: Faults,
		validator: DetailValidator = new DetailValidator(),
	) {
		this.#faults = faults;
		this.#validator = validator;
	}

	async record(tx: TxContext, entry: AuditEntry): Promise<void> {
		// 검증이 먼저다 — 위반이면 아무것도 쓰지 않고 PermanentError 로 끝난다.
		this.#validator.check(entry.detail);
		await tx.db.insert(auditLog).values({
			at: tx.now,
			category: entry.category,
			action: entry.action,
			actorRole: entry.actorRole,
			actorKey: entry.actorKey ?? null,
			targetType: entry.targetType ?? null,
			targetId: entry.targetId ?? null,
			outcome: entry.outcome,
			reasonCode: entry.reasonCode ?? null,
			traceId: entry.traceId,
			detail: entry.detail,
		});
		// 행이 들어간 뒤의 실패 — 던지면 호출 트랜잭션이 롤백되어 행위와 이 행이 함께 사라진다(AC-020).
		await this.#faults.hit(AUDIT_WRITER_AFTER_RECORD);
	}
}
