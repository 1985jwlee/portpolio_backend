import type { TSchema } from "@sinclair/typebox";
import { EventEnvelope } from "./events/envelope.ts";
import "./formats.ts";
import { ErrorBody } from "./rest/error-body.ts";
import { ClientHello, ClientPing } from "./ws/client-messages.ts";

/**
 * 계약 스키마의 이름 붙은 목록. 이름은 `<이름>.v<N>` 이고 `schema/<이름>.json`·`golden/<이름>.json` 의 파일명이 된다.
 * 이벤트는 `registerEvent(type, version, schema)` 로 등록해 이름이 `<type>.v<version>` 이 된다.
 */
export class ProtocolRegistry {
	readonly #schemas = new Map<string, TSchema>();

	register(name: string, schema: TSchema): void {
		if (this.#schemas.has(name)) {
			throw new Error(`이미 등록된 스키마다: ${name}`);
		}
		this.#schemas.set(name, schema);
	}

	registerEvent(type: string, version: number, schema: TSchema): void {
		if (!Number.isInteger(version) || version < 1) {
			throw new Error(
				`이벤트 버전은 1 이상의 정수여야 한다: ${type} v${version}`,
			);
		}
		this.register(`${type}.v${version}`, schema);
	}

	get(name: string): TSchema | undefined {
		return this.#schemas.get(name);
	}

	getEvent(type: string, version: number): TSchema | undefined {
		return this.get(`${type}.v${version}`);
	}

	/** 이름순으로 정렬한 전체 목록 — 내보내기가 결정적이도록 순서를 고정한다. */
	entries(): ReadonlyArray<readonly [string, TSchema]> {
		// 이름은 유일하므로 같은 경우가 없다.
		return [...this.#schemas.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
	}
}

// 골격 최소분 — 공용 봉투만 등록한다. 모듈별 DTO·이벤트는 각 모듈 계약 패키지 몫이다(ADR-052 결정 2).
export const protocolRegistry = new ProtocolRegistry();
protocolRegistry.register("rest.error-body.v1", ErrorBody);
protocolRegistry.register("ws.client-hello.v1", ClientHello);
protocolRegistry.register("ws.client-ping.v1", ClientPing);
protocolRegistry.register("events.envelope.v1", EventEnvelope);
