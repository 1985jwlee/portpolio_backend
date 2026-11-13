# G10b — 모듈별 마이그레이션 소유 (S0-7b)

[ADR-052](../../docs/adr/ADR-052-extractable-monolith.md) 결정 7(모듈이 자기 마이그레이션 폴더·설정·이력 표를 소유한다)의 가능성 시험. **제품 코드가 아니다**(스파이크). 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md). 이전 G10 은 [`../g4-g10-db/`](../g4-g10-db/) — 거기서는 이력 표 하나(`drizzle.__drizzle_migrations`)에 한 폴더를 적용했다.

## 환경 고정
`postgres:18`(시험마다 같은 컨테이너에서 새 DB), Bun 1.4.4, `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11(정확히 고정, `bun.lock` 커밋). 실행: `bun g10b.ts`.

## 구성 — 모듈 셋, 각자 폴더
`modules/{alpha,beta,gamma}/` 마다 `drizzle.config.ts`·`src/schema.ts`·`migrations/`(0000 = `generate`, 0001 = `generate --custom` + raw SQL). 마이그레이션은 저장소 루트(이 폴더)에서 모듈 설정으로 만들었다.
```bash
bunx drizzle-kit generate --config modules/<m>/drizzle.config.ts --name=schema
bunx drizzle-kit generate --custom --config modules/<m>/drizzle.config.ts --name=raw_objects   # 빈 파일에 raw SQL 을 채움
```
- alpha: 표 `item` + 부분 UNIQUE 인덱스·`alpha.try_leader`. beta: 표 `ledger_line` + CHECK·부분 인덱스. gamma: 표 `outbox` + 트리거(채널 `gamma_outbox`).
- **이력 표 설계(주 경로)**: `migrationsSchema = "pf_migrations"`, `migrationsTable = "<모듈>"`. 이유는 소스에서 이미 알고 있다 — `drizzle-kit generate` 가 낸 0000 이 `CREATE SCHEMA "<m>"` 으로 시작하므로, 이력 표를 모듈 스키마(`<m>`) 안에 두면 마이그레이터가 먼저 그 스키마를 만들어 0000 이 충돌할 수 있다(ADR-052 결정 7 초안의 `migrationsSchema = <m>` 가정은 이 시험 전에 위 이유로 바꾼다). 마이그레이터가 `migrationsTable`/`migrationsSchema` 를 받는 것은 `pg-core/dialect.js` 소스로 확인했고, **적용 동작은 이 시험이 확인한다.**
- 적용은 모듈마다 `src/migrate.ts` 를 별도 프로세스로 돌린다(`drizzle-orm/bun-sql/migrator`).

## 시험 전에 고정한 기준 (2026-11-11)
덤프 정규화는 G10 과 같다(`pg_dump -s`, `--` 주석·`\restrict`·`\unrestrict` 줄 제거). 모듈 덤프는 `-n <모듈>` 하나씩, 전체 덤프는 셋을 합친다(이력 스키마 `pf_migrations` 제외).

| # | 기준 | 합격 |
|---|---|---|
| 1 | **격리(정적)**: 모듈 `migrations/*.sql` 에 **다른 모듈 스키마 이름**(`"alpha"`·`"beta"`·`"gamma"` 중 자기 것 외)이 나오지 않는다 | 0건 |
| 2 | **모듈별 적용**: 새 빈 DB 에 alpha→beta→gamma 순서로 각자 폴더·이력 표로 적용하면 모두 종료 코드 0, `pf_migrations.<모듈>` 이력이 모듈마다 정확히 2행, 기본 이력 표 `drizzle.__drizzle_migrations` 는 생기지 않는다 | 셋 모두 |
| 3 | **순서 불변**: 세 모듈의 6가지 적용 순서를 각각 새 DB 에 적용했을 때 전체 덤프 6개가 바이트 동일하다 | 6/6 동일 |
| 4 | **부분 재적용 격리**: 임시 복사본에서 beta 에 세 번째 마이그레이션(`generate --custom`, 인덱스 1개 추가)을 만들고 beta 만 적용하면 beta 이력 3행·beta 덤프가 바뀌고, alpha·gamma 의 이력 행 수와 모듈 덤프는 불변이다 | 모두 |
| 5 | **단독 적용**: beta 폴더만 있는 임시 프로젝트(다른 모듈 폴더 없음)에서 빈 DB 에 적용하면 성공하고 beta 모듈 덤프가 기준 2 의 beta 덤프와 동일하다 | 동일 |
| 6 | **객체 동작**: alpha 활성 중복 삽입은 **23505**·소프트 삭제 뒤 같은 조합은 허용 / beta 허용 밖 `status` 는 **23514** / gamma 삽입은 `gamma_outbox` 채널로 NOTIFY 된다 | 셋 모두 |
| 7 | **멱등**: 기준 2 의 DB 에 세 모듈을 다시 적용하면 종료 코드 0, 이력 행 수·전체 덤프 불변 | 불변 |
| 8 | 위 1~7 을 3회 반복해도 같다 (반복마다 새 DB, 기준 1 은 정적이라 1회) | 3/3 |
| 9 | **관찰(판정 아님)**: 모듈이 기본 이력 표 하나를 공유하고 **생성 시각의 역순**(gamma→beta→alpha)으로 적용하면 어떻게 되는가 — 각 모듈의 표가 만들어졌는지 기록. 모듈별 이력 표가 필요한 이유를 확인한다 | 기록 |

**판정**: 1~8 이 모두 합격이면 PASS(ADR-052 결정 7 채택 가능). 하나라도 실패하면 FAIL — 결정 7 을 철회하고 ‘집계 유지’ 로 돌아가며 결정 2 는 사용자가 다시 정한다. 기준은 결과를 본 뒤 바꾸지 않는다(하네스 오류는 기준 변경 없이 고치고 커밋 메시지에 기록).

## 한계 (시험 전에 적는다)
- 모듈 셋·표 하나씩인 합성 스키마다. 실제 모듈의 복잡한 객체(확장, 파티션 등)는 포함하지 않는다.
- 모듈 간 실행 시 동시성(두 인스턴스가 같은 모듈을 동시에 적용)은 다루지 않는다(운영 규칙 ②: 마이그레이션 잡은 단일 실행).
- 개발 PC 한 곳에서만 돌린다. 호스트 재측정은 하지 않는다.
