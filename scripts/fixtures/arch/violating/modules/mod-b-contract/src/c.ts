// 위반 픽스처 B13-contract: 계약 패키지가 kernel 밖을 임포트한다.
import { db } from "../../../packages/db/src/index.ts";

export const c = db;
