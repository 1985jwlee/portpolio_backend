// 프로세스 종료 코드(F16 §9.8) — 생명주기가 쓰는 값은 이 파일 한 곳이다.
// 설정 오류 78 은 @pf/config 의 exitCodeFor 도 같은 값을 낸다(저쪽은 설정 로더의 몫이라 값만 일치시킨다).

export const EXIT_CODES = Object.freeze({
	/** 정상 종료 */
	OK: 0,
	/** 마이그레이션 뒤처짐·grace 초과 강제 종료·정지 실패 */
	FAILURE: 1,
	/** DB 불가(EX_UNAVAILABLE) */
	DB_UNAVAILABLE: 69,
	/** 내부 오류(EX_SOFTWARE) — 분류되지 않은 기동 실패 */
	INTERNAL: 70,
	/** 설정 오류(EX_CONFIG) */
	CONFIG: 78,
});
