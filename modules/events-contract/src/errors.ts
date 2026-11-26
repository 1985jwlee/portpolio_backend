import type { Uuid } from "@pf/kernel";

/**
 * 서비스 경계를 건너는 오류 본문.
 *
 * 판별은 `code` 로만 한다. `kind`·`name` 은 싣지 않는다 — kernel `AppError.kind` 는 프로토타입 접근자라
 * `JSON.stringify` 에 나오지 않고(TD-7 7-5), 사본 사이에서 클래스 이름으로 판별하면 도메인 오류가 전부 500 으로 나간다.
 * 이 모양을 바꾸면 `golden/contract-error.v1.json` 이 바뀌므로 `check:contract-version` 이 버전 상승을 요구한다.
 */
export type ContractErrorDto = {
	readonly code: string;
	readonly message: string;
	readonly traceId: Uuid;
};
