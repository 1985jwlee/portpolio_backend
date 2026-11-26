// testkit 통합 시험 기반. 시험 파일이 아니다(이름에 .test 없음).
// 계약: TEST_DATABASE_URL 은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터를 가리킨다.
// 없으면 건너뛰지 않고 실패한다 — 조용히 0건으로 끝나는 것이 가장 나쁜 실패다.
export function adminUrl(): string {
	const url = process.env.TEST_DATABASE_URL;
	if (url === undefined || url === "") {
		throw new Error(
			"TEST_DATABASE_URL 이 없다 — 통합 시험은 슈퍼유저로 접속하는, 버려도 되는 Postgres 클러스터가 필요하다 (예: postgres://postgres:pw@127.0.0.1:5432/postgres)",
		);
	}
	return url;
}
