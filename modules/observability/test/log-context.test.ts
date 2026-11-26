// LogContext(L2) — G5(Bun 의 AsyncLocalStorage)가 실제로 되는지의 첫 시험이다.
// await 경계 둘(타이머·마이크로태스크·Promise.all)을 넘어도 trace_id 가 유지돼야 하고, 실패하면 계획 재검토 사유다(인자 전달로 전환).
import { describe, expect, test } from "bun:test";
import { LogContext } from "@pf/observability";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("LogContext", () => {
	test("맥락 밖에서는 빈 객체다", () => {
		expect(new LogContext().current()).toEqual({});
	});

	test("await 경계(타이머·마이크로태스크·Promise.all)를 넘어도 trace_id 가 유지된다", async () => {
		const context = new LogContext();
		const seen: (string | undefined)[] = [];
		await context.run({ traceId: "trace-1" }, async () => {
			seen.push(context.current().traceId);
			await sleep(5);
			seen.push(context.current().traceId);
			await Promise.resolve();
			seen.push(context.current().traceId);
			await Promise.all([
				sleep(2).then(() => seen.push(context.current().traceId)),
				Promise.resolve().then(() => seen.push(context.current().traceId)),
			]);
			await new Promise<void>((resolve) =>
				queueMicrotask(() => {
					seen.push(context.current().traceId);
					resolve();
				}),
			);
		});
		expect(seen).toEqual(Array(seen.length).fill("trace-1"));
		expect(seen.length).toBe(6);
	});

	test("동시에 도는 두 흐름의 맥락이 섞이지 않는다", async () => {
		const context = new LogContext();
		const results = await Promise.all(
			["a", "b", "c"].map((id, index) =>
				context.run({ traceId: id }, async () => {
					await sleep(10 - index * 3);
					return context.current().traceId;
				}),
			),
		);
		expect(results).toEqual(["a", "b", "c"]);
	});

	test("안쪽 run 은 바깥 값을 지키면서 덧붙인다", () => {
		const context = new LogContext();
		context.run({ traceId: "t", module: "guestbook" }, () => {
			context.run({ usecase: "PostEntry" }, () => {
				expect(context.current()).toEqual({
					traceId: "t",
					module: "guestbook",
					usecase: "PostEntry",
				});
			});
			// 안쪽이 끝나면 바깥 맥락으로 돌아온다.
			expect(context.current()).toEqual({ traceId: "t", module: "guestbook" });
		});
	});

	test("run 이 끝나면 맥락이 비워진다", () => {
		const context = new LogContext();
		context.run({ traceId: "t" }, () => undefined);
		expect(context.current()).toEqual({});
	});
});
