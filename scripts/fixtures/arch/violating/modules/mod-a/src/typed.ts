// 위반 픽스처 B13-impl-module: 타입만 가져와도 구현 임포트다.
import type { B } from "../../mod-b/src/index.ts";

export type T = B;
