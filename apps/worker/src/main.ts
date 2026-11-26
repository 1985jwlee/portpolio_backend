// worker 데몬 진입점 — 조립 로직은 ./compose 에만 있다(B10·B13). 운영 명령은 ./cli/main.ts 다.
import { runWorker } from "./compose/boot.ts";

await runWorker();
