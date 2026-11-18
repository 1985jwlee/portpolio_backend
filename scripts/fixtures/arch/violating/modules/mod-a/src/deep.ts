// 위반 픽스처 B4-deep-module 과 B13-impl-module: 다른 모듈의 내부 파일을 임포트한다.
import { secret } from "../../mod-b/src/domain/secret.ts";

export const d = secret;
