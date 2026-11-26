// 서버와 클라이언트가 같은 값을 써야 하는 상수(01 §8.6, ADR-023). 환경변수가 아니라 코드 상수다.
// `ALLOWED_EMOJI`(고정 6종)는 목록이 문서에 확정되지 않아 넣지 않는다 — 목록이 정해지면 이 파일에 더한다.

export const ENTRY_BODY_MAX_CHARS = 500;
export const ENTRY_BODY_MAX_LINES = 10;
export const DISPLAY_NAME_MIN_CHARS = 2;
export const DISPLAY_NAME_MAX_CHARS = 20;
export const REPORT_REASON_MAX_CHARS = 200;
