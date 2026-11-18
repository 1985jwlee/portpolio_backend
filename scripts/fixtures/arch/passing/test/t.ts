// 통과 픽스처 B4: 교차 시험이 모듈의 index 를 임포트한다.
import { b } from "../modules/mod-b/src/index.ts";

export const t = b;
