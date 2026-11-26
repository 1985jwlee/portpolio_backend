// HttpServerComponent·ConfigComponent·ReadinessComponent(L2) — 포트 0 의 실제 소켓으로 정지 의미를 잰다.
import { describe, expect, test } from "bun:test";
import {
	ConfigComponent,
	HttpServerComponent,
	ReadinessComponent,
} from "@pf/infra";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("HttpServerComponent", () => {
	test("시작하면 포트 0 으로 열린 실제 포트에서 응답하고, 시작 전 port 는 던진다", async () => {
		const server = new HttpServerComponent({
			port: 0,
			fetch: () => new Response("hello"),
		});
		expect(() => server.port).toThrow();
		await server.start();
		try {
			const response = await fetch(`http://127.0.0.1:${server.port}/`);
			expect(await response.text()).toBe("hello");
		} finally {
			await server.stop(1_000);
		}
	});

	test("정지하면 새 연결을 받지 않는다", async () => {
		const server = new HttpServerComponent({
			port: 0,
			fetch: () => new Response("hello"),
		});
		await server.start();
		const { port } = server;
		await server.stop(1_000);
		await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
	});

	test("진행 중인 요청은 기한 안이면 끝까지 기다렸다 응답이 나간다", async () => {
		const server = new HttpServerComponent({
			port: 0,
			fetch: async () => {
				await sleep(150);
				return new Response("late");
			},
		});
		await server.start();
		const pending = fetch(`http://127.0.0.1:${server.port}/`);
		await sleep(30);
		const stopping = server.stop(5_000);
		expect(await (await pending).text()).toBe("late");
		await stopping;
	});

	test("기한을 넘기면 진행 중 요청을 두고 강제로 닫아 정지가 기한 안에 돌아온다", async () => {
		const server = new HttpServerComponent({
			port: 0,
			fetch: async () => {
				await sleep(3_000);
				return new Response("never");
			},
		});
		await server.start();
		const pending = fetch(`http://127.0.0.1:${server.port}/`).catch(
			() => "aborted",
		);
		await sleep(30);
		const startedAt = performance.now();
		await server.stop(100);
		expect(performance.now() - startedAt).toBeLessThan(1_500);
		await pending;
	});

	test("시작하지 않은 채 stop 해도 안전하다", async () => {
		await new HttpServerComponent({
			port: 0,
			fetch: () => new Response(""),
		}).stop(0);
	});
});

describe("ConfigComponent · ReadinessComponent", () => {
	test("ConfigComponent 는 시작에서 요약을 한 줄 남긴다", async () => {
		const seen: { msg: string; fields?: unknown }[] = [];
		const component = new ConfigComponent(
			{
				info: (msg, fields) => seen.push({ msg, fields }),
				error: () => undefined,
			},
			{ values: { API_PORT: 3001 }, secretNames: ["DATABASE_URL"] },
		);
		await component.start();
		expect(seen).toEqual([
			{
				msg: "config loaded",
				fields: { values: { API_PORT: 3001 }, secretNames: ["DATABASE_URL"] },
			},
		]);
	});

	test("ReadinessComponent 는 시작에서 draining 을 풀고 정지에서 건다", async () => {
		const flags: boolean[] = [];
		const component = new ReadinessComponent({
			setDraining: (flag) => flags.push(flag),
		});
		await component.start();
		await component.stop();
		expect(flags).toEqual([false, true]);
		expect(component.phase).toBe(50);
	});
});
