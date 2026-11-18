// 위반 픽스처 B14-identity: identity 가 아닌 모듈이 identity-contract 를 임포트한다.
import { id } from "../../identity-contract/src/index.ts";

export const i = id;
