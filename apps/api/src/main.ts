// api 진입점 — 조립 로직은 ./compose 에만 있다(B10·B13: 비조립 코드는 infra·모듈 구현을 임포트하지 않는다).
import { runApi } from "./compose/boot.ts";

await runApi();
