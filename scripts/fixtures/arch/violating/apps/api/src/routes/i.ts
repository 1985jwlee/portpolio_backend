// 위반 픽스처 B10-infra: 조립 밖 엔트리포인트 코드가 packages/infra 를 임포트한다.
import { infra } from "../../../../packages/infra/src/index.ts";

export const i = infra;
