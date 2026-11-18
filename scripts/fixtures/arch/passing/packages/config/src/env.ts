// 통과 픽스처 B9: packages/config 는 환경을 읽고 process 를 임포트할 수 있다.
import { env } from "node:process";

export const v = [process.env.PF_FIXTURE, env];
