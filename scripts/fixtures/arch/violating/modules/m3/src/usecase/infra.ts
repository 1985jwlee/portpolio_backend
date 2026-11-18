// 위반 픽스처 B10-infra: usecase 가 packages/infra 를 임포트한다.
import { infra } from "../../../../packages/infra/src/index.ts";

export const i = infra;
