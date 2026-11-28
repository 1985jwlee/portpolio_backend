// ApiHarness — 실제 Postgres 위에서 ApiRoot 를 프로세스 안으로 구동하고 소켓 없이 요청을 보낸다(L3).
// 위치가 testkit 이 아닌 이유: testkit(packages)은 apps 를 임포트할 수 없다(B7-packages-up) — DV-031.
// 시계·id 는 testkit 의 가짜, 장애 훅은 하니스의 FaultInjector(주입이 없으면 NoopFaults 와 같다)를 꽂는다.
import { SecretString } from "@pf/config";
import { DbHarness } from "@pf/testkit";
import { ApiRoot } from "../../src/compose/root.ts";
import type { ApiConfig } from "../../src/config.ts";

// 하니스가 띄운 루트를 멈출 때 주는 기한 — 진행 중 요청이 없어 길 필요가 없다.
const STOP_DEADLINE_MS = 5_000;

export class ApiHarness extends DbHarness {
	/** 센티널로 쓰는 로그 줄 모음 — 시험이 출력에 무엇이 실렸는지 본다. */
	readonly logLines: string[] = [];
	#root: ApiRoot | undefined;

	/** setup() 뒤에만 있다. */
	get root(): ApiRoot {
		if (this.#root === undefined) {
			throw new Error("ApiHarness.setup() 전에는 root 가 없다");
		}
		return this.#root;
	}

	override async setup(): Promise<void> {
		await super.setup();
		const config: ApiConfig = {
			APP_ENV: "test",
			LOG_LEVEL: "debug",
			DATABASE_URL: new SecretString(this.db.url()),
			// 0 이면 운영체제가 빈 포트를 고른다 — 병렬 시험과 충돌하지 않는다.
			API_PORT: 0,
			DRAIN_DELAY_MS: 0,
		};
		this.#root = new ApiRoot({
			config,
			clock: this.clock,
			ids: this.ids,
			faults: this.faults,
			sink: { write: (line) => this.logLines.push(line) },
		});
		await this.#root.start();
	}

	/** 소켓을 거치지 않고 앱에 요청 하나를 보낸다. */
	request(request: Request): Promise<Response> {
		return this.root.handle(request);
	}

	override async teardown(): Promise<void> {
		await this.#root?.stop(STOP_DEADLINE_MS);
		this.#root = undefined;
		await super.teardown();
	}
}
