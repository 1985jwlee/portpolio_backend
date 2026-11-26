// 로그 줄의 도착지. 로거는 직렬화한 한 줄(개행 없음)만 넘기고, 어디에 쓰는지는 모른다.

export interface LogSink {
	write(line: string): void;
}

/** 표준 출력에 한 줄씩 낸다(컨테이너 로그 드라이버가 수집한다 — F17 §6.2). */
export class StdoutJsonSink implements LogSink {
	write(line: string): void {
		process.stdout.write(`${line}\n`);
	}
}
