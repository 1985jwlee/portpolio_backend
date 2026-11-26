// TypeBox `format` 검증기 등록(F16 §12.4). 서버·시험이 같은 검증기를 쓰도록 이 파일을 임포트하면 등록된다.
import { FormatRegistry } from "@sinclair/typebox";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 03: 시각은 ISO 8601 UTC 문자열이다 — 오프셋 표기는 받지 않는다.
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export function isUuid(value: string): boolean {
	return UUID.test(value);
}

export function isDateTime(value: string): boolean {
	return DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

// 같은 이름을 두 번 등록하지 않는다 — 모듈이 여러 경로로 평가돼도 안전하게 한다.
if (!FormatRegistry.Has("uuid")) {
	FormatRegistry.Set("uuid", isUuid);
}
if (!FormatRegistry.Has("date-time")) {
	FormatRegistry.Set("date-time", isDateTime);
}
