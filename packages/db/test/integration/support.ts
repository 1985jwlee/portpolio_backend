// 통합 시험 기반 — 시험 DB 획득·격리·정리, 픽스처 역할, 카탈로그 스냅샷, 대기 도구. 시험 파일이 아니다(이름에 .test 없음).
// 계약: 환경변수 TEST_DATABASE_URL 은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터를 가리킨다(contrib 확장 citext·pg_trgm 이 설치 가능해야 한다 — 공식 이미지는 포함).
// 없으면 건너뛰지 않고 실패한다 — 조용히 0건으로 끝나는 것이 가장 나쁜 실패다.
import { fileURLToPath } from "node:url";
import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/** 픽스처 역할 — roles.json 의 관리 역할과 같은 이름이다. 클러스터 전역이라 만들기만 하고 지우지 않는다. */
export const FIXTURE_ROLES = [
	"pf_api_rw",
	"pf_worker_rw",
	"pf_gateway_ro",
] as const;

export const FIXTURE_MODULES = fileURLToPath(
	new URL("../fixtures/modules/", import.meta.url),
);

/** 픽스처 모듈 alpha 의 표 — UoW·잡 대역·권한 시험이 같은 정의로 쓴다. */
export const alphaItem = pgSchema("alpha").table("item", {
	id: integer("id").primaryKey(),
	entryId: integer("entry_id").notNull(),
	actorId: text("actor_id").notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 25;

export function adminUrl(): string {
	const url = process.env.TEST_DATABASE_URL;
	if (url === undefined || url === "") {
		throw new Error(
			"TEST_DATABASE_URL 이 없다 — 통합 시험은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터가 필요하다 (예: postgres://postgres:pw@127.0.0.1:5432/postgres)",
		);
	}
	return url;
}

/** 조건이 참이 될 때까지 폴링한다. 상한을 넘기면 던진다 — 고정 sleep 으로 순서를 맞추지 않는다. */
export async function waitFor(
	label: string,
	condition: () => Promise<boolean> | boolean,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await condition())) {
		if (Date.now() > deadline) {
			throw new Error(`대기 초과(${timeoutMs}ms): ${label}`);
		}
		await Bun.sleep(POLL_INTERVAL_MS);
	}
}

/** 약속에 상한을 건다 — 게이트에 닿지 못한 대역이 시험을 매달지 않게 한다. */
export async function within<T>(
	label: string,
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error(`대기 초과(${timeoutMs}ms): ${label}`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/** 밖에서 열 수 있는 약속 — 게이트의 reached/release 한 쌍을 이것 둘로 만든다. */
export function deferred(): {
	readonly promise: Promise<void>;
	resolve(): void;
} {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve: () => resolve() };
}

// pg_isready 직후에도 서버가 한 번 재시작할 수 있다 — 연결이 될 때까지 조건 폴링한다.
let serverReady: Promise<void> | undefined;
function ensureServerReady(): Promise<void> {
	serverReady ??= waitFor(
		"Postgres 연결 준비",
		async () => {
			const probe = new Bun.SQL(adminUrl());
			try {
				await probe`select 1`;
				return true;
			} catch {
				return false;
			} finally {
				await probe.close();
			}
		},
		READY_TIMEOUT_MS,
	);
	return serverReady;
}

/** 시험 파일마다 새 DB 를 만든다(`pf_t_<무작위>`). 파일 간 격리의 단위다. */
export async function freshDatabase(): Promise<{
	readonly url: string;
	readonly name: string;
	drop(): Promise<void>;
}> {
	await ensureServerReady();
	const name = `pf_t_${crypto.randomUUID().replaceAll("-", "")}`;
	const admin = new Bun.SQL(adminUrl());
	try {
		// 이름은 위에서 우리가 만든 16진수뿐이라 인용만으로 충분하다(CREATE DATABASE 는 바인드를 못 받는다).
		await admin.unsafe(`create database "${name}"`);
	} finally {
		await admin.close();
	}
	const url = new URL(adminUrl());
	url.pathname = `/${name}`;
	return {
		url: url.toString(),
		name,
		async drop() {
			const dropper = new Bun.SQL(adminUrl());
			try {
				await dropper.unsafe(`drop database if exists "${name}" with (force)`);
			} finally {
				await dropper.close();
			}
		},
	};
}

/** 픽스처 역할을 없을 때만 만든다. 역할은 클러스터 전역이라 지우지도 바꾸지도 않고, 생성 경합(42710)은 이미 있는 것으로 본다. */
export async function ensureFixtureRoles(): Promise<void> {
	await ensureServerReady();
	const admin = new Bun.SQL(adminUrl());
	try {
		for (const role of FIXTURE_ROLES) {
			const found = await admin`select 1 from pg_roles where rolname = ${role}`;
			if (found.length > 0) {
				continue;
			}
			try {
				await admin.unsafe(`create role "${role}" nologin`);
			} catch (error) {
				if (!(error instanceof Error) || !isDuplicateObject(error)) {
					throw error;
				}
			}
		}
	} finally {
		await admin.close();
	}
}

function isDuplicateObject(error: Error): boolean {
	return Reflect.get(error, "errno") === "42710";
}

/** 대상 스키마의 열·제약·인덱스·함수를 이름순으로 이어 붙인 문자열 — 적용 순서가 달라도 같은지 비교하는 데 쓴다. */
export async function catalogSnapshot(
	url: string,
	schemas: ReadonlyArray<string>,
): Promise<string> {
	const client = new Bun.SQL(url);
	const list = schemas.join(",");
	try {
		const columns = await client`
			select table_schema, table_name, column_name, data_type, is_nullable, column_default
			from information_schema.columns
			where table_schema = any(string_to_array(${list}, ','))
			order by table_schema, table_name, column_name`;
		const constraints = await client`
			select conrelid::regclass::text as relation, conname, pg_get_constraintdef(c.oid) as definition
			from pg_constraint c join pg_namespace n on n.oid = c.connamespace
			where n.nspname = any(string_to_array(${list}, ','))
			order by relation, conname`;
		const indexes = await client`
			select schemaname, tablename, indexname, indexdef
			from pg_indexes
			where schemaname = any(string_to_array(${list}, ','))
			order by schemaname, tablename, indexname`;
		const functions = await client`
			select n.nspname, p.proname, pg_get_functiondef(p.oid) as definition
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = any(string_to_array(${list}, ','))
			order by n.nspname, p.proname`;
		return JSON.stringify([
			[...columns],
			[...constraints],
			[...indexes],
			[...functions],
		]);
	} finally {
		await client.close();
	}
}

/** 한 번 연결해 질의하고 닫는다 — 관찰·단정용이다(풀과 별개의 연결). */
export async function queryRows(
	url: string,
	text: string,
	values: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
	const client = new Bun.SQL(url);
	try {
		return [...(await client.unsafe(text, values))];
	} finally {
		await client.close();
	}
}
