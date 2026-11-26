// 공개 표면 — 이 파일이 events 모듈이 내보내는 이름의 유일한 목록이다. `export *` 를 쓰지 않는다.
// adapter(PostgresAuditWriter)는 여기서 다시 내보내지 않는다(B6) — 조립 루트가 직접 받는다(Q2, 01-repository-structure §5).

export { DetailValidator } from "./audit/detail-validator.ts";
