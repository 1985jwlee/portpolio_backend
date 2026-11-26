// 위반 픽스처 B4-deep-compose: 조립이 모듈의 index.ts·adapter/ 가 아닌 깊은 경로(domain)를 임포트한다.
import { secret } from "../../../../modules/mod-b/src/domain/secret.ts";

export const d = secret;
