// 경계 바깥(프로세스 환경·파일시스템)과 닿는 부분 전부 — 이 패키지에서 process.env 를 읽는 유일한 파일이다.
// 값 원천이 순서·빈 값·끝 개행을 정하고, 분류·경고·규칙은 로더(loader.ts)가 맡는다.
import { readFileSync } from "node:fs";

export type SecretFileFailure = "file_not_found" | "file_unreadable";

// 안쪽 원천은 env 또는 absent 만 돌려준다. file 은 FileBackedEnvSource 만 만든다.
// bothSet 은 NAME 과 NAME_FILE 이 둘 다 비어 있지 않다는 뜻이다.
export type EnvLookup =
	| { readonly kind: "absent"; readonly bothSet: false }
	| {
			readonly kind: "env";
			readonly value: string;
			readonly bothSet: boolean;
	  }
	| {
			readonly kind: "file";
			readonly value: string;
			readonly bothSet: false;
	  }
	| {
			readonly kind: "file";
			readonly failure: SecretFileFailure;
			readonly bothSet: false;
	  };

export type EnvSource = { lookup(name: string): EnvLookup };

export type SecretFileRead =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly reason: SecretFileFailure };

const ABSENT: EnvLookup = Object.freeze({ kind: "absent", bothSet: false });

// 빈 문자열은 없음이다 — 견본(.env.example)이 필수 비밀을 비워 두므로 복사만으로 기동이 성공하면 안 된다.
function fromRaw(value: string | undefined): EnvLookup {
	return value === undefined || value === ""
		? ABSENT
		: { kind: "env", value, bothSet: false };
}

export class ProcessEnvSource implements EnvSource {
	// 기동 시 스냅샷을 만들지 않고 그때그때 읽는다.
	lookup(name: string): EnvLookup {
		return fromRaw(process.env[name]);
	}
}

export class MapEnvSource implements EnvSource {
	readonly #entries: ReadonlyMap<string, string>;

	constructor(entries: Readonly<Record<string, string>>) {
		this.#entries = new Map(Object.entries(entries));
	}

	lookup(name: string): EnvLookup {
		return fromRaw(this.#entries.get(name));
	}
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

// 예외 메시지에는 경로가 들어 있어서 버린다 — 분류 코드만 돌려준다.
export function readSecretFile(path: string): SecretFileRead {
	try {
		return { ok: true, text: readFileSync(path, "utf8") };
	} catch (error: unknown) {
		return {
			ok: false,
			reason: isNodeErrorWithCode(error, "ENOENT")
				? "file_not_found"
				: "file_unreadable",
		};
	}
}

// 맨 앞 BOM 한 개와 끝의 \r·\n 연속을 지운다. 공백·탭·중간 개행은 유지한다.
// 읽기 방법(readFileSync 는 BOM 을 남기고 Bun.file().text() 는 지운다)과 무관하게 같은 결과가 되도록 여기서 처리한다.
function normalizeSecretText(text: string): string {
	const withoutBom = text.startsWith("﻿") ? text.slice(1) : text;
	return withoutBom.replace(/[\r\n]+$/, "");
}

// NAME 이 있으면 그것을 쓰고(파일은 읽지 않는다), 없고 NAME_FILE 이 있으면 그 파일을 읽는다.
// 읽기 실패는 기본값으로 가지 않도록 값이 아니라 failure 로 돌려준다.
export class FileBackedEnvSource implements EnvSource {
	readonly #inner: EnvSource;
	readonly #readFile: (path: string) => SecretFileRead;

	constructor(
		inner: EnvSource,
		readFile: (path: string) => SecretFileRead = readSecretFile,
	) {
		this.#inner = inner;
		this.#readFile = readFile;
	}

	lookup(name: string): EnvLookup {
		const pathLookup = this.#inner.lookup(`${name}_FILE`);
		const direct = this.#inner.lookup(name);
		if (direct.kind === "env") {
			return {
				kind: "env",
				value: direct.value,
				bothSet: pathLookup.kind === "env",
			};
		}
		if (pathLookup.kind !== "env") {
			return ABSENT;
		}
		const read = this.#readFile(pathLookup.value);
		return read.ok
			? {
					kind: "file",
					value: normalizeSecretText(read.text),
					bothSet: false,
				}
			: { kind: "file", failure: read.reason, bothSet: false };
	}
}
