// FieldCipher pg_dump 센티널(L3, AC-018 의 일부) — 암호화한 열의 평문이 pg_dump 평문 출력에 나오지 않는다.
// "없다" 는 거짓 초록이 되기 쉬워 양성 대조 둘을 같은 시험에 넣는다(매 실행 자기 검출력을 단언한다):
//   ① 덤프가 실제로 그 행을 담았다 — 봉투가 출력에 있다(빈 덤프·다른 스키마 덤프를 잡는다)
//   ② 검사 문자열이 작동한다 — 평문으로 쓴 센티널은 출력에 **있다**(인코딩·검색 오류를 잡는다)
// 실행 수단은 env PF_PG_DUMP(없으면 PATH 의 pg_dump). 실행 불가·비정상 종료는 실패다 — 건너뛰지 않는다(support.ts).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestDb } from "@pf/testkit";
import { AesGcmFieldCipher, parseKeyring } from "../../src/index.ts";
import { adminUrl, dumpSchema } from "./support.ts";

const SETUP_TIMEOUT_MS = 60_000;
const DUMP_TIMEOUT_MS = 60_000;

// 센티널은 실행마다 무작위 접미를 붙인다 — 다른 시험·로그와 겹쳐 우연히 맞는 일이 없게 한다.
const random = crypto.randomUUID().replaceAll("-", "");
const ENCRYPTED_SENTINEL = `ENC-SENTINEL-${random}`;
const PLAIN_SENTINEL = `PLAIN-PROBE-${random}`;

const testDb = new TestDb(adminUrl());
let schema: string;
let envelope: string;

beforeAll(async () => {
	const parsed = parseKeyring({
		active: "k1",
		keys: { k1: Buffer.alloc(32, 9).toString("base64") },
	});
	if (!parsed.ok) {
		throw parsed.error;
	}
	const cipher = new AesGcmFieldCipher(parsed.value);

	await testDb.start();
	const fresh = await testDb.freshSchema();
	schema = fresh.schema;
	await fresh.sql.unsafe(
		"create table report_probe (id integer primary key, note_enc text, plain_probe text)",
	);
	envelope = cipher.encrypt(
		ENCRYPTED_SENTINEL,
		`${schema}.report_probe.note_enc:1`,
	);
	await fresh.sql.unsafe(
		"insert into report_probe (id, note_enc) values (1, $1)",
		[envelope],
	);
	await fresh.sql.unsafe(
		"insert into report_probe (id, plain_probe) values (2, $1)",
		[PLAIN_SENTINEL],
	);
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
	await testDb.stop();
});

describe("pg_dump 평문 출력의 센티널", () => {
	test(
		"암호화한 열의 센티널은 없고, 덤프는 봉투와 평문 대조 센티널을 담고 있다",
		async () => {
			const dump = await dumpSchema(testDb.url(), schema);

			// 본 검사 — 암호화한 평문이 덤프에 없다.
			expect(dump).not.toContain(ENCRYPTED_SENTINEL);
			// 양성 대조 ① — 덤프가 실제로 그 행을 담았다.
			expect(dump).toContain(envelope);
			// 양성 대조 ② — 같은 검색이 평문 센티널은 찾는다.
			expect(dump).toContain(PLAIN_SENTINEL);
		},
		DUMP_TIMEOUT_MS,
	);
});
