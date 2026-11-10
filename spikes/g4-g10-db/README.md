# G4·G10 — DB 드라이버와 Drizzle 마이그레이션 (S0-4, S0-7)

[tech-stack §11](../../docs/domains/tech-stack.md) 관문 G4(DB 드라이버)·G10(마이그레이션), 쿼리 계층 규칙은 [ADR-025](../../docs/adr/ADR-025-query-layer.md). **제품 코드가 아니다**(스파이크). 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md).

> 이전 로컬 결과(tech-stack §11.1 G4·G10)는 재현 스크립트가 없어 ‘참고값’이다. 이 폴더가 재현 스크립트를 대신한다.

## 환경 고정
Postgres `postgres:18` 컨테이너(시험마다 새로 띄움), Bun 1.4.4, `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11(둘 다 정확히 고정, `bun.lock` 커밋).

## 마이그레이션은 이렇게 만들었다 (G10 ‘생성’ 증거)
```bash
bunx drizzle-kit generate --name=schema           # → drizzle/0000_schema.sql (CREATE SCHEMA + 테이블 2개)
bunx drizzle-kit generate --custom --name=raw_objects   # → drizzle/0001_raw_objects.sql (빈 파일) 에 raw SQL 을 채움
```
raw SQL 은 스키마 정의로 표현할 수 없는 것들이다: 부분 UNIQUE 인덱스, 부분 인덱스, CHECK, 어드바이저리 락 보조 함수(`spike.try_leader`), NOTIFY 트리거.

## 시험 전에 고정한 기준 (2026-11-10)

### G10 — `bun g10.ts`
시험은 **저장소 파일을 건드리지 않도록** `drizzle/` 을 임시 폴더로 복사해 그 안에서 `drizzle-kit migrate` 를 실행한다.

| # | 기준 | 합격 |
|---|---|---|
| 1 | 새 빈 DB 에서 `drizzle-kit migrate` 가 두 마이그레이션을 순서대로 적용한다 | 종료 코드 0, `drizzle.__drizzle_migrations` 2행 |
| 2 | 부분 UNIQUE 인덱스: `pg_indexes` 에 `WHERE` 조건이 있고, 활성 중복은 **23505** 로 거절되며 소프트 삭제 뒤 같은 조합은 허용된다 | 셋 모두 |
| 3 | 부분 인덱스 `outbox_pending_idx` 가 `status = 'pending'` 조건으로 존재한다 | 존재 |
| 4 | CHECK: 허용되지 않는 `status` 삽입은 **23514** 로 거절된다 | 거절 |
| 5 | 보조 객체: `spike.try_leader(key)` 가 한 세션에서 true, 다른 세션에서 false 이고, 아웃박스 삽입이 트리거로 `outbox` 채널에 NOTIFY 한다 | 둘 모두 |
| 6 | **재현**: 두 번째 새 DB 에 같은 절차를 적용하면 `pg_dump --schema-only`(주석·`\restrict` 줄 제거) 결과가 첫 번째와 **바이트 동일** | 동일 |
| 7 | **멱등**: 같은 DB 에 `migrate` 를 다시 실행하면 종료 코드 0, 이력 행 수와 스키마 덤프 불변 | 불변 |
| 8 | 관찰(판정 아님): 이미 적용된 마이그레이션 파일을 고쳐 다시 `migrate` 하면 오류도 변경도 없는가(운영 규칙 ③) | 기록 |
| 9 | 위 1~7 을 3회 반복해도 같다 | 3/3 |

### G4 — `bun g4.ts`
| # | 기준 | 합격 |
|---|---|---|
| 1 | Drizzle `bun-sql` 어댑터: 빌더 insert/select, `transaction` 커밋은 반영되고 예외로 롤백하면 흔적이 없다 | 둘 모두 |
| 2 | LISTEN/NOTIFY **전용 연결**(`Bun.SQL` 별도 인스턴스의 `listen`): 다른 연결이 보낸 NOTIFY 100개를 **순서대로 100/100** 받는다(5초 이내) | 100/100, 순서 일치 |
| 3 | **재구독**: Postgres 컨테이너를 재시작한 뒤 새로 보낸 NOTIFY 를 **30초 이내**에 다시 받는다(끊긴 동안의 NOTIFY 는 유실되며 이는 기대 동작 — 보정은 change_log 재조회) | 수신 |
| 4 | `FOR UPDATE SKIP LOCKED` 선점: 1000행·8개 워커(각자 별도 연결)가 모두 처리하며 **중복 처리 0, 누락 0** | 1000 = 1000 |
| 5 | 늦은 완료 거절: 임대가 만료돼 다른 워커가 재선점한 행에 대해 이전 소유자의 완료 UPDATE(`WHERE owner_token = 이전`)는 **0행** | 0행 |
| 6 | 어드바이저리 리더 선출: 8개 연결이 `pg_try_advisory_lock(k)` 하면 **정확히 1개**가 true 이고, 그 연결을 닫으면 **2초 이내** 다른 연결이 획득한다 | 1개, 2초 |
| 7 | SQLSTATE: 유니크 위반 오류에서 `errno` 로 `23505` 를 읽는다 | 일치 |
| 8 | 위 1~7 을 3회 반복해도 같다(반복마다 새 컨테이너) | 3/3 |

## 한계
- 개발 PC(WSL2)의 Docker 에서 잰다. 호스트 재측정은 하지 않는다(기능 시험이라 호스트 종속이 적다).
- `postgres:18` 한 이미지·한 마이너에서만 확인한다. pgbouncer 등 중간 계층은 없다.
- 부하 성능은 이 시험의 대상이 아니다(S6 이후 통합 시험).
