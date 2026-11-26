// 위반 픽스처 B4-deep-outside·B13-impl-app: 조립 밖 엔트리포인트 코드가 모듈 adapter 를 임포트한다 — adapter 예외는 조립만의 것이다.
import { a } from "../../../../modules/m1/src/adapter/a.ts";

export const r = a;
