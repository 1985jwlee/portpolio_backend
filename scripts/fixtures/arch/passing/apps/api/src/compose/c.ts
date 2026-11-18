// 통과 픽스처 B10·B13·B14: 조립이 infra·모듈 index·identity 를 임포트한다.
import { identity } from "../../../../modules/identity/src/index.ts";
import { b } from "../../../../modules/mod-b/src/index.ts";
import { infra } from "../../../../packages/infra/src/index.ts";

export const c = [b, identity, infra];
