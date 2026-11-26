// 컬럼 보호 등급 맵 — database-schema §9(`events · inbox` 절). 정본은 거기이고 이 맵이 코드 쪽 사본이다.
// 모든 컬럼이 여기에 있어야 `bun run check:classification` 이 통과한다. 등급 타입은 scripts 쪽 정의라 임포트하지 않는다(경계).
export const classification = {
	audit_log: {
		id: "SYS",
		at: "SYS",
		category: "SYS",
		action: "SYS",
		actor_role: "SYS",
		// 행위자 키 — 로그·지표 레이블 금지.
		actor_key: "PSD",
		target_type: "SYS",
		target_id: "SYS",
		outcome: "SYS",
		reason_code: "SYS",
		trace_id: "SYS",
		// 작은 jsonb(개수·버전). 본문·IP·토큰·신고 메모는 DetailValidator 가 막는다.
		detail: "SYS",
	},
};
