// 통과 픽스처 B1: adapter 가 port 를 임포트한다. adapter 안의 시간 호출은 허용된다.
import { p } from "../port/p.ts";

export const a = p;
export const n = Date.now();
