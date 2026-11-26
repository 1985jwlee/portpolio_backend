// 장애 주입 지점 이름의 정본 목록(F16 §13.6). 이름 규칙은 `<모듈>.<usecase 또는 컴포넌트>.<지점>` 소문자 snake_case 다.
// `guestbook.<usecase>.after_load` 는 자리표시자라 구체 usecase 가 생길 때 그 usecase 몫으로 더한다.
export const FAULT_POINTS = {
	OUTBOX_WRITER_BEFORE_APPEND: "events.outbox_writer.before_append",
	OUTBOX_DISPATCHER_AFTER_CLAIM: "events.outbox_dispatcher.after_claim",
	AUDIT_WRITER_AFTER_RECORD: "events.audit_writer.after_record",
	MESSAGE_RUNNER_BEFORE_COMPLETE: "events.message_runner.before_complete",
	GUESTBOOK_EDIT_ENTRY_BEFORE_SAVE: "guestbook.edit_entry.before_save",
	GUESTBOOK_IDEMPOTENCY_AFTER_RESERVE: "guestbook.idempotency.after_reserve",
} as const;

export type FaultPoint = (typeof FAULT_POINTS)[keyof typeof FAULT_POINTS];
