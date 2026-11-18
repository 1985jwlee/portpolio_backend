// 위반 픽스처 B5-module-cycle: alpha 와 beta 가 서로를 임포트한다(파일 순환은 없다).
import { beta } from "../../beta/src/index.ts";

export const alpha = beta;
