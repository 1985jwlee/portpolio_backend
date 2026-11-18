// 위반 픽스처 B2-io-package: domain 이 packages/db 를 임포트한다.
import { db } from "../../../../packages/db/src/index.ts";

export const d = db;
