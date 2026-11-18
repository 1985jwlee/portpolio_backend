// 위반 픽스처 B11-write: adapter/postgres 밖에서 쓰기 메서드를 부른다.
const db = { insert: (n: number) => n };
export const w = db.insert(1);
