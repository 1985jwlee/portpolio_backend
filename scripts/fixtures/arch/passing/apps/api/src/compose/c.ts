// 통과 픽스처 B4·B10·B13·B14: 조립이 infra·모듈 index·모듈 어댑터(Q2)·identity 를 임포트한다.
import { identity } from "../../../../modules/identity/src/index.ts";
import { a } from "../../../../modules/m1/src/adapter/a.ts";
import { b } from "../../../../modules/mod-b/src/index.ts";
import { infra } from "../../../../packages/infra/src/index.ts";

export const c = [a, b, identity, infra];
