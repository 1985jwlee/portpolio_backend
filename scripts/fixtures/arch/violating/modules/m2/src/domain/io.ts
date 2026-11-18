// 위반 픽스처 B2-core: domain 이 내장 모듈을 임포트한다.
import { readFileSync } from "node:fs";

export const io = readFileSync;
