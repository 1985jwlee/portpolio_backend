// worker CLI 진입점 — `bun run worker <명령>`. 설정·DB 가 필요한 명령은 그 명령을 더하는 행이 CliRoot 를 조립한다.
import { createCommands, runCli } from "./run-cli.ts";

process.exitCode = runCli(
	Bun.argv.slice(2),
	createCommands(),
	(line) => console.log(line),
	(line) => console.error(line),
);
