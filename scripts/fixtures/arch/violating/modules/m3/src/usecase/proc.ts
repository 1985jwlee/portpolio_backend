// 위반 픽스처 B9-process-import: 설정 밖에서 내장 모듈 process 를 임포트한다.
import { env } from "node:process";

export const e = env;
