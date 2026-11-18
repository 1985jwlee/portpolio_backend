// 통과 픽스처 B6·B11: adapter 안 간선, adapter/postgres 안의 쓰기 메서드.
import { a } from "../a.ts";

const t = { insert: (n: number) => n };
export const w = t.insert(a);
