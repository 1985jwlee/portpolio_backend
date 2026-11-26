/** 지금 연결돼 있는 연결 수. 같은 연결 id 는 한 번만 센다. 구현은 이 패키지 밖에 둔다. */
export interface PresenceCounter {
	join(connId: string): void;
	leave(connId: string): void;
	count(): number;
}
