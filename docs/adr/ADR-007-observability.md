# ADR-007: 관측은 Prometheus + Grafana 읽기 전용 임베드
- 상태: Accepted
- 날짜: 2026-11-03
- 근거: 원 계획안 모순 #10, Phase 4 / 명세 FR-060·061, AC-012, 가정 A-005·A-010 / 인터뷰 R6-Q2

## 맥락
이 사이트는 운영 지표를 공개해 관측 역량을 보인다. 선택지는 백엔드 지표 API + Next.js 자체 화면, 또는 업계 표준 Prometheus + Grafana 다. 원 계획안은 "Zero-Downtime·상용 프로덕션 수준"을 주장하면서 관측성이 계획에 없던 점을 모순으로 지적했다.

## 결정
**Prometheus + Grafana** 를 쓰고, Grafana 는 **Public dashboards(읽기 전용)** 를 우선해 사이트에 임베드한다. 임베드는 관문 G6 로컬 실측으로 확인했다(tech-stack.md §11.1: `GF_SECURITY_ALLOW_EMBEDDING=true`, 익명 접근 off). **후퇴안은 없다** — 익명 Viewer 안은 `POST /api/ds/query` 로 임의 PromQL 이 실행되고 다른 대시보드·데이터 소스 목록이 열려 후퇴안으로도 부적합하다. Public dashboards 가 실패하면 임베드를 포기하고 링크/스크린샷으로 대체한다. 앱은 지표를 Prometheus 형식으로 노출한다. 트레이싱은 선택 항목으로 후속 단계에서 검토한다.

## 설계 상세

### 지표 이름 규약과 핵심 지표
- **모든 지표는 `pf_` 접두**를 쓴다(예: `pf_http_requests_total`). 전체 카탈로그(이름·종류·레이블 허용목록·발생 위치·알람 후보)의 정본은 [design/features/17](../design/features/17-ops-observability.md) 이다. 이 표는 핵심만 둔다.

| 지표 | 종류 | 용도 |
|---|---|---|
| `pf_http_requests_total` | 카운터 | 경로(`route` 템플릿)·메서드·상태 분류별 요청 수 |
| `pf_http_request_duration_seconds` | 히스토그램 | p95 판정(NFR 300ms) |
| `pf_outbox_depth{status}` | 게이지 | 적체(전달 지연의 선행 지표) |
| `pf_outbox_dead_total` · `pf_inbox_dead_total` | 카운터 | dead-letter 발생 |
| `pf_event_process_duration_seconds` | 히스토그램 | 소비 처리 시간 |
| `pf_event_end_to_end_seconds` | 히스토그램 | 작성→소비 완료까지 시간 |
| `pf_ws_connections{channel}` | 게이지 | 접속자 수(public/private) |
| `pf_ws_resume_total{mode}` | 카운터 | 재접속·재개 빈도(replay/snapshot) |
| `pf_ws_queue_overflow_total` | 카운터 | 느린 소비자 종료(4408) |

### 레이블 규칙
**세션 식별자·사용자 식별자·글 내용을 레이블로 쓰지 않는다.** 카디널리티 폭증과 개인정보 노출을 막는다(ADR-008).

### Grafana 공개 설정
- 공개 방식 우선순위: ① Public dashboards(Grafana 공식이 익명 접근보다 더 안전한 공유 방법으로 안내) ② 후퇴안 없음(익명 Viewer 는 임의 PromQL 실행이 가능해 부적합, G6 실측). Public dashboards 가 안 되면 임베드를 포기하고 링크/스크린샷으로 대체한다. 공개 페이지는 **보기 권한만**, 편집·탐색 기능 비활성.
- 공개 페이지 HTML 에 데이터 소스 이름·uid·내부 URL 이 노출되므로 데이터 소스 URL 에 자격 증명을 두지 않고, Grafana 포트의 `/metrics`(무인증)는 프록시에서 차단한다. 공개 토큰이 곧 자격이라 유출 시 공개를 해제하고 재발급한다.
- 대시보드·데이터소스는 **코드(프로비저닝 파일)로 관리**하고 UI 에서 수정하지 않는다.
- 사이트 임베드를 허용하는 설정과 보안 헤더를 의도적으로 열고, 그 외 경로는 외부에 노출하지 않는다. Prometheus 는 외부 비공개.
- 수집 주기는 구현 시 정한다(미결, 이 ADR 의 몫). 자원 부담과 해상도의 절충.

## 대안과 기각 이유
- **자체 지표 API + 화면(당초 추천)**: 컨테이너가 적고 디자인 통일이 쉽다. 그러나 사용자가 업계 표준 스택을 보이는 쪽을 선택했다.

## 결과
- 얻는 것: 표준 스택 증명, 원 계획안 Phase 4 와 일치.
- 치르는 것: 컨테이너 2개 추가(무료 자원 부담), 익명 임베드의 보안 설정, 테마 통일 작업.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 익명 임베드로 의도치 않은 데이터 노출 | 프로비저닝된 대시보드만, 레이블 규칙, 배포 전 노출 점검 |
| 메모리 압박 | 수집 주기·보존 기간 축소, 최후에는 자체 화면으로 후퇴 |

## 검증 방법
AC-012(임베드 표시, 편집 UI 비노출). 레이블에 식별자가 없는지 지표 스크레이프 결과를 점검.

## 실서비스라면
관리형 관측 서비스 또는 사내 Grafana 를 쓰고 공개 임베드는 하지 않는다.

## 재검토 조건
Prometheus·Grafana 메모리가 한도를 압박해 다른 서비스가 불안정해질 때.

## 관련 ADR
ADR-002(메모리), ADR-005(적체 지표), ADR-008(레이블 금지)
