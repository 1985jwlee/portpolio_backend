// 위반 픽스처 B4-deep-outside: 교차 시험이 다른 모듈의 스키마 진입을 임포트한다(packages/db 가 아니다).
import { schema } from "../modules/mod-b/src/adapter/postgres/schema.ts";

export const t = schema;
