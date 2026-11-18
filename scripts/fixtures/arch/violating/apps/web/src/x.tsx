// 위반 픽스처 B8-web: 웹이 protocol 밖 서버 패키지를 임포트한다.
import { db } from "../../../packages/db/src/index.ts";

export const X = db;
