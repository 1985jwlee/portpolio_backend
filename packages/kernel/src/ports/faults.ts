/**
 * 장애 주입 지점의 훅. 코드가 지점마다 `await faults.hit("<모듈>.<usecase 또는 컴포넌트>.<지점>")` 를 한 줄 심는다.
 * 운영 구현은 즉시 끝나는 빈 함수이고, 시험 구현(`@pf/testkit` 의 `FaultInjector`)이 실패·지연을 주입한다.
 * 이름 상수의 정본은 testkit 의 `FAULT_POINTS` 다 — 운영 코드는 testkit 을 임포트할 수 없어 이름만 문자열로 받는다.
 * 구현은 이 패키지 밖에 둔다.
 */
export interface Faults {
	hit(point: string): Promise<void>;
}
