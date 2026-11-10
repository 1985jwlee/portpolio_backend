# G5 — 지표 라이브러리와 레이블 규칙 (S0-5)

[tech-stack §11](../../docs/domains/tech-stack.md) 관문 G5, 설계는 [design/features/17-ops-observability.md](../../docs/design/features/17-ops-observability.md) §0.3(이름·레이블 규칙)·OB-01(지표 모듈)·§4(`pf_http_*`, `pf_outbox_*`). **제품 코드가 아니다**(스파이크). 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md).

> 이전 결과(tech-stack: prom-client 15.1.3 이 Bun 1.4.4 에서 Registry·Counter·Histogram·`/metrics` 동작, `nodejs_eventloop_lag_seconds` 는 항상 0 등)는 재현 스크립트가 없어 ‘참고값’이다.

## 환경 고정
Bun 1.4.4, `elysia` 1.4.30, `prom-client` 15.1.3(정확히 고정, `bun.lock` 커밋). 서버는 실제 포트(`127.0.0.1:39500`)에서 돌고 `fetch` 로 요청한다.

## 시험 전에 고정한 기준 (2026-11-10) — `bun verify.ts`
| # | 기준 | 합격 |
|---|---|---|
| 1 | `/metrics` 가 Prometheus 텍스트 형식(`text/plain; version=0.0.4`)이고 모든 비주석 줄이 `이름{레이블} 값` 형식으로 파싱된다 | 파싱 실패 0 |
| 2 | `pf_http_requests_total{app,method,route,status_class}` 가 요청 수와 **정확히** 일치한다: `/api/ping` 20회 → 20, 서로 다른 id 의 `/api/entries/:id` 5회 → **한 시리즈**로 5 | 일치 |
| 3 | `pf_http_request_duration_seconds` 히스토그램에 설계 버킷(0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5, 5, +Inf)이 모두 있고, 50ms 지연 라우트 10회가 0.025 버킷에는 0건, 0.1 버킷에는 10건으로 쌓인다 | 일치 |
| 4 | **outbox 적체 지표**: `pf_outbox_depth{status="new"}` 와 `pf_outbox_oldest_age_seconds{status="new"}` 가 시뮬레이션한 큐 상태(7건·age 42)를 그대로 보이고, 갱신(3건)되면 따라간다 | 일치 |
| 5 | **LabelPolicy**: 금지 레이블(`user_id`)로 지표를 정의하면 등록 시 예외. 등록되지 않은 지표 기록은 dev 모드에서 예외, prod 모드에서는 버려지고 `pf_metrics_dropped_total` 이 증가 | 셋 모두 |
| 6 | **카디널리티**: 서로 다른 UUID 경로 1,000건 + 서로 다른 404 경로 1,000건 + 요청마다 다른 `X-Forwarded-For` 를 보낸 뒤, `pf_http_requests_total` 시리즈 수가 **≤ 20**, `/metrics` 전체에 UUID·IPv4 패턴이 **0건** | 둘 모두 |
| 7 | 404 는 `route="unmatched"` 하나로 모인다 | 한 시리즈, status_class="4xx" |
| 8 | 값 검사 보조선: 레이블 값에 UUID 가 들어오면 거부(prod 에서는 버리고 `pf_metrics_dropped_total` 증가) | 거부 |
| 9 | 스크레이프 지연: 시리즈 약 100개에서 `/metrics` 50회 응답 시간 p95 | **≤ 50ms** (제안값) |
| 10 | 기본 지표 점검(관찰, 판정 아님): `nodejs_eventloop_lag_seconds` 가 항상 0 인가, `nodejs_eventloop_lag_p99_seconds`·`process_resident_memory_bytes` 가 유효한 값인가 | 기록 |
| 11 | 위 1~9 를 3회 반복해도 같다(반복마다 서버를 새로 띄움) | 3/3 |

## 구성
| 파일 | 역할 |
|---|---|
| `src/metrics.ts` | 설계 OB-01 의 `LabelPolicy`·`MetricsRegistry`(prom-client 를 어댑터 뒤에 둠) |
| `src/app.ts` | Elysia 앱: 요청 미들웨어(`route` 템플릿, `status_class`, 지연), `/metrics`, 시험용 라우트 |
| `verify.ts` | 서버를 띄워 위 기준을 시험하고 `results/` 에 원시 결과를 남긴다 |

## 한계
- 로깅은 이 관문의 범위(`/metrics` 와 레이블 규칙)가 아니다. 구조화 로그는 S7 에서 다룬다.
- 단일 프로세스·단일 앱이다. 앱별 `app` 레이블과 Prometheus 스크레이프는 S7 통합 때 확인한다.
- 이벤트 루프 지연 등 기본 지표의 값 자체는 WSL2 에서의 관찰이다.
