// 통과 픽스처 B1·B2·B7: service 가 domain 과 kernel 만 임포트한다.
import { k } from "../../../../packages/kernel/src/index.ts";
import { d } from "../domain/d.ts";

export const s = [d, k];
