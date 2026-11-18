// 위반 픽스처 B13-impl-app: 조립 밖 엔트리포인트 코드가 모듈 구현을 임포트한다.
import { b } from "../../../../modules/mod-b/src/index.ts";

export const r = b;
