// 위반 픽스처 B7-kernel: kernel 이 자기 밖(내장 모듈)을 임포트한다.
import { readFileSync } from "node:fs";

export const k = readFileSync;
