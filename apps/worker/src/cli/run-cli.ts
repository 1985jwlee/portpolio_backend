// `worker <명령>` 프레임(F16 §11) — 첫 인자로 명령표를 찾는다. 등록된 명령은 `help` 하나뿐이고, 실명령은 담당 행이 더한다.
// 종료 코드: 0 성공 · 2 사용법 오류(명령 없음·모르는 명령). 3(대상 없음)·78(설정)은 설정·usecase 를 쓰는 실명령의 몫이다.

export type CliCommand = {
	readonly name: string;
	readonly summary: string;
	run(args: readonly string[], write: (line: string) => void): number;
};

export const EXIT_USAGE = 2;

export function createCommands(): readonly CliCommand[] {
	const commands: CliCommand[] = [];
	commands.push({
		name: "help",
		summary: "명령 목록을 보인다",
		run: (_args, write) => {
			write("사용법: bun run worker <명령> [옵션]");
			for (const command of commands) {
				write(`  ${command.name}  ${command.summary}`);
			}
			return 0;
		},
	});
	return commands;
}

/** 명령을 찾아 실행하고 종료 코드를 돌려준다. 출력은 `write`(사용법 오류는 `writeError`)로만 낸다. */
export function runCli(
	argv: readonly string[],
	commands: readonly CliCommand[],
	write: (line: string) => void,
	writeError: (line: string) => void,
): number {
	const [name, ...rest] = argv;
	if (name === undefined) {
		writeError("명령이 없다. 목록은 `bun run worker help`");
		return EXIT_USAGE;
	}
	const command = commands.find((candidate) => candidate.name === name);
	if (command === undefined) {
		writeError(`모르는 명령 ${name}. 목록은 \`bun run worker help\``);
		return EXIT_USAGE;
	}
	return command.run(rest, write);
}
