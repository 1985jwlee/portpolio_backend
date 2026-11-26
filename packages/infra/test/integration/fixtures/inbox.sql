-- 시험 전용 inbox 표 — PostgresEventTransport 시험이 구독자의 receive 로 저장하는 곳이다(마이그레이션이 아니다, 계획 Q9-A).
-- 열은 DBS §4-5 공통 형태에서 이 시험이 쓰는 것만 옮겼고 PK 는 (consumer, message_id) 다. `arrival` 은 삽입 순서를 읽으려는 시험 전용 열이다.
-- TODO(TD-9 9-1, S3-4): S3-4 가 실제 inbox 마이그레이션을 만들면 이 fixture 를 그 마이그레이션 적용으로 대체한다 — 열이 어긋나면 이 시험이 낡는다.
-- TestDb.freshSchema() 가 search_path 를 새 스키마로 맞춘 연결에서 실행하므로 표 이름에 스키마를 붙이지 않는다.
create table inbox (
	arrival bigserial,
	consumer text not null,
	message_id uuid not null,
	type text not null,
	schema_version integer not null,
	occurred_at timestamptz not null,
	payload jsonb not null,
	status text not null default 'received',
	received_at timestamptz not null default now(),
	primary key (consumer, message_id)
);
