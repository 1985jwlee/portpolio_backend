import { PermanentError } from "@pf/kernel";

// 시험마다 격리된 DB 와 스키마. 접속 URL 은 생성자 인자로 받는다 — 제품 소스(B9-env)라 환경변수를 직접 읽지 않는다.
// `adminUrl` 은 DB 를 만들 수 있는 슈퍼유저 접속이고, 시험이 만드는 DB 는 `stop()` 에서 지운다.

export type FreshSchema = {
	/** 새로 만든 스키마 이름. */
	readonly schema: string;
	/** `search_path` 가 그 스키마로 맞춰진 전용 연결. `stop()` 이 닫는다. */
	readonly sql: Bun.ReservedSQL;
};

// 이름은 우리가 만든 16진수뿐이라 식별자 인용만으로 충분하다(CREATE DATABASE·SCHEMA 는 바인드를 받지 못한다).
function randomName(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

// 시험 DB 안에서 TRUNCATE 하지 않는 스키마 — 마이그레이션 이력은 지우면 다음 적용이 처음부터 돈다.
const KEEP_SCHEMAS = ["pg_catalog", "information_schema", "pf_migrations"];

export class TestDb {
	readonly #adminUrl: string;
	#name: string | undefined;
	#url: string | undefined;
	#client: Bun.SQL | undefined;
	#connections: Bun.ReservedSQL[] = [];

	constructor(adminUrl: string) {
		this.#adminUrl = adminUrl;
	}

	/** 이 TestDb 전용 DB 를 만든다. 두 번 부르면 오류다. */
	async start(): Promise<void> {
		if (this.#name !== undefined) {
			throw new PermanentError({ message: "TestDb 가 이미 시작됐다" });
		}
		const name = randomName("pf_t");
		const admin = new Bun.SQL(this.#adminUrl);
		try {
			await admin.unsafe(`create database "${name}"`);
		} finally {
			await admin.close();
		}
		const url = new URL(this.#adminUrl);
		url.pathname = `/${name}`;
		this.#name = name;
		this.#url = url.toString();
		this.#client = new Bun.SQL(this.#url);
	}

	/** 현재 시험 DB 의 접속 URL — LISTEN 전용 연결·`pg_dump` 가 쓴다. */
	url(): string {
		if (this.#url === undefined) {
			throw new PermanentError({
				message: "TestDb.start() 전에는 url() 이 없다",
			});
		}
		return this.#url;
	}

	/** 새 스키마를 만들고 `search_path` 를 그곳으로 맞춘 전용 연결을 돌려준다. */
	async freshSchema(): Promise<FreshSchema> {
		const client = this.#requireClient();
		const schema = randomName("s");
		await client.unsafe(`create schema "${schema}"`);
		const sql = await client.reserve();
		this.#connections.push(sql);
		await sql.unsafe(`set search_path to "${schema}"`);
		return { schema, sql };
	}

	/** 모든 사용자 스키마의 표를 비운다. 스키마·표 정의는 남긴다. */
	async truncate(): Promise<void> {
		const client = this.#requireClient();
		const keep = KEEP_SCHEMAS.map((s) => `'${s}'`).join(",");
		const tables = await client.unsafe(
			`select quote_ident(schemaname) || '.' || quote_ident(tablename) as name
			 from pg_tables
			 where schemaname not in (${keep}) and schemaname not like 'pg_%'`,
		);
		if (tables.length === 0) {
			return;
		}
		const names = tables.map((row: { name: string }) => row.name).join(", ");
		await client.unsafe(`truncate table ${names} restart identity cascade`);
	}

	/** 연결을 닫고 시험 DB 를 지운다. 시작하지 않았으면 아무 일도 하지 않는다. */
	async stop(): Promise<void> {
		const name = this.#name;
		if (name === undefined) {
			return;
		}
		for (const connection of this.#connections) {
			await connection.release();
		}
		this.#connections = [];
		await this.#client?.close();
		this.#client = undefined;
		this.#name = undefined;
		this.#url = undefined;
		const admin = new Bun.SQL(this.#adminUrl);
		try {
			await admin.unsafe(`drop database if exists "${name}" with (force)`);
		} finally {
			await admin.close();
		}
	}

	#requireClient(): Bun.SQL {
		if (this.#client === undefined) {
			throw new PermanentError({
				message: "TestDb.start() 전에는 쓸 수 없다",
			});
		}
		return this.#client;
	}
}
