// 위반 픽스처 B4-deep-db 와 B7-packages-up: db 가 스키마 진입 외의 모듈 내부 파일을 임포트한다.
import { secret } from "../../../modules/mod-b/src/domain/secret.ts";

export const d = secret;
