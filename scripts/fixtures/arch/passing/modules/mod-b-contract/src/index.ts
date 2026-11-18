// 통과 픽스처 B13-contract: 계약 패키지가 kernel 만 임포트한다.
import type { K } from "../../../packages/kernel/src/index.ts";

export type C = K;
