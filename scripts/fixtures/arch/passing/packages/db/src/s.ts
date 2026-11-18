// 통과 픽스처 B4: packages/db 가 모듈의 스키마 진입을 임포트한다.
import { schema } from "../../../modules/mod-b/src/adapter/postgres/schema.ts";

export const s = schema;
