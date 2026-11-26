import type { Uuid } from "../domain.ts";

/** 감사 분류. 보관 기간이 갈린다(`auth` 7일, `admin`·`system` 90일). */
export type AuditCategory = "auth" | "admin" | "system";

/** 기록 대상 행위의 고정 열거(database-schema §4-3). 새 행위는 ADR-027 이 정한 뒤 여기에 더한다. */
export type AuditAction =
	| "login_succeeded"
	| "login_failed"
	| "logout"
	| "entry_hidden"
	| "entry_unhidden"
	| "report_resolved"
	| "write_lock_changed"
	| "report_note_read"
	| "sessions_revoked"
	| "dead_requeued"
	| "field_keys_rotated"
	| "projection_rebuilt"
	| "retention_ran"
	| "retention_paused";

export type AuditActorRole = "anonymous" | "user" | "admin" | "system";

export type AuditOutcome = "success" | "denied" | "failed";

/** 감사 항목 하나. 해당 없는 선택 필드는 생략하며 저장소에서는 NULL 이 된다. */
export type AuditEntry = {
	readonly category: AuditCategory;
	readonly action: AuditAction;
	readonly actorRole: AuditActorRole;
	/** `session:<id>` / `user:<id>`. system 행위자면 생략한다. */
	readonly actorKey?: string;
	readonly targetType?: string;
	/** uuid 문자열. */
	readonly targetId?: string;
	readonly outcome: AuditOutcome;
	/** 실패·거절 사유의 고정 열거. */
	readonly reasonCode?: string;
	readonly traceId: Uuid;
	/** 작은 평면 메타(개수·버전). 본문·IP·토큰·메모는 담지 않는다 — 구현이 검증한다. */
	readonly detail: Readonly<Record<string, unknown>>;
};

/**
 * 행위와 같은 트랜잭션에 감사 행을 남기는 포트. `Tx` 는 구현이 정한다 — 포트는 해석하지 않고 그대로 넘긴다.
 * 구현은 이 패키지 밖에 둔다.
 */
export interface AuditWriter<Tx> {
	/**
	 * `tx` 에 감사 행 하나를 추가한다. 호출 트랜잭션이 롤백되면 이 행도 없다.
	 * `detail` 이 규칙을 어기면 `PermanentError`(프로그래밍 오류)를 던지고 아무것도 쓰지 않는다.
	 */
	record(tx: Tx, entry: AuditEntry): Promise<void>;
}
