# 02. 개발 환경

로컬에서 **처음 클론한 뒤 사이트가 뜨기까지**와, 로컬에서 **Funnel·OAuth·K8s** 를 시험하는 방법을 고정한다.
근거: ADR-002(Compose 라이브 · k3d 검증) · ADR-003(진입) · ADR-022(관문) · ADR-023(백업) · [01](01-repository-structure.md)(스크립트·환경변수).

> 다이어그램 해당 여부 — 순서도: 개발 모드 선택(§1) / 시퀀스: 로컬 기동(§2.2), OAuth 로그인 시험(§6), Funnel 시험(§7) / 클래스·상속: 시드 실행기(§4)만 해당. compose·k3d 는 선언형 구성이라 클래스가 없다.

---

## 1. 실행 방식

기본은 **"앱은 호스트에서 직접(`bun --watch`), 인프라는 compose"** 다. 코드 변경이 즉시 반영되고 디버거를 붙이기 쉽다. 같은 이미지로 전체를 띄우는 모드는 배포 전 확인용이다.

```mermaid
flowchart TD
    S["무엇을 하려는가"] --> Q1{"코드 수정·디버깅?"}
    Q1 -- "예" --> A["모드 A: 앱은 호스트(bun --watch)<br/>인프라는 compose.dev"]
    Q1 -- "아니오" --> Q2{"배포 이미지·nginx·헤더 확인?"}
    Q2 -- "예" --> B["모드 B: compose 전체<br/>(로컬 빌드 이미지)"]
    Q2 -- "아니오" --> Q3{"Gateway API·롤링·재접속 시험?"}
    Q3 -- "예" --> C["모드 C: k3d"]
    Q3 -- "아니오" --> A
```

| 모드 | 앱 | 인프라 | 진입 주소 |
|---|---|---|---|
| **A** 개발 | 호스트 프로세스 4개 | compose: postgres · prometheus · grafana · **proxy(nginx)** | `http://localhost:8080` |
| **B** 통합 | compose: web · api · ws-gateway · worker | 위와 동일 | `http://localhost:8080` |
| **C** K8s | k3d 클러스터 | 클러스터 내부 | `http://localhost:8081` (§8) |

모드 A 에서도 proxy 는 compose 로 띄우고 **호스트 앱으로 프록시**한다(`host.docker.internal`). 그래서 브라우저에서는 항상 한 출처(`:8080`)이고 **CORS 가 필요 없으며** 쿠키·WebSocket 경로가 운영과 같다.

## 2. 로컬 compose

### 2.1 파일과 서비스

| 파일 | 역할 |
|---|---|
| `infra/compose/compose.yaml` | 공통 정의: 모든 서비스(이미지·헬스체크·네트워크·볼륨) |
| `infra/compose/compose.dev.yaml` | 개발 오버라이드: 앱 서비스 비활성(`profiles: ["apps"]`), 포트 공개, proxy 가 호스트 앱으로 |
| `infra/compose/compose.live.yaml` | 라이브 오버라이드: GHCR 이미지, `restart`, 포트 비공개(`proxy` 는 127.0.0.1 로만 바인딩), 비밀 파일 마운트 (Funnel 은 호스트의 `tailscaled` 가 맡아 compose 서비스가 아니다) |

| 서비스 | 이미지(고정 방침) | 컨테이너 포트 → 호스트(개발) | 볼륨 | 헬스체크 |
|---|---|---|---|---|
| `postgres` | `postgres:18-alpine` | 5432 → **55432** | `pgdata` | `pg_isready` |
| `proxy` | nginx (realip 포함 여부 G7, Funnel IP 헤더 G14 ④) | 8080 → **8080** | `infra/nginx` 읽기 전용 마운트 | `GET /nginx-health` |
| `redis` (프로필 `redis`, **기본 기동 제외**) | 도입 시 이미지 고정(Redis 확정 U8, ADR-024) | — | — | — |
| `prometheus` | `prom/prometheus` 3.15.x | 9090 → 9090 | `prometheus-data` | `/-/ready` |
| `grafana` | `grafana/grafana` 13.3.x | 3000 → **3030** (web 과 충돌 회피) | `grafana-data`, 프로비저닝 마운트 | `/api/health` |
| `web` · `api` · `ws-gateway` · `worker` | `ghcr.io/<owner>/pf-web` · `pf-server` | 3000 · 3001 · 3002 · 3003 | — | `/readyz` (worker 는 `/healthz`) |
| `backup` | 호스트 cron 또는 컨테이너 (ADR-023) | — | `backups` (DB 볼륨과 **다른 경로**) | 마지막 성공 시각 지표 |

- 호스트 포트 `55432`·`3030` 은 충돌 회피용 **기본 제안값**이다(로컬에 이미 PostgreSQL/다른 3000 서비스가 있을 수 있다). 바꾸면 `.env` 의 `DATABASE_URL_*` 4개도 같이 바꾼다.
- 이미지 태그는 메이저(+마이너) 고정이고 확정 버전은 구현 시작 시 재조회한다(tech-stack.md §12).
- 네트워크는 compose 기본 브리지 하나. **`postgres`·`prometheus`·`grafana` 는 라이브에서 호스트 포트를 열지 않는다**(proxy 를 거치거나 내부 전용).

### 2.2 기동 시퀀스 (모드 A)

```mermaid
sequenceDiagram
    actor Dev as 개발자
    participant B as bun scripts
    participant DC as docker compose
    participant PG as postgres
    participant M as db:migrate
    participant S as db:seed
    participant App as api · ws · worker · web
    Dev->>B: bun install --frozen-lockfile
    Dev->>B: cp .env.example .env (값 채움)
    Dev->>B: bun run compose:up
    B->>DC: up -d postgres proxy prometheus grafana
    DC->>PG: 기동 + 헬스체크 대기
    PG-->>DC: healthy
    Dev->>B: bun run db:migrate
    B->>M: drizzle forward-only 적용
    M->>PG: 마이그레이션 SQL
    Dev->>B: bun run db:seed
    B->>S: 시드 시나리오 실행 (usecase 경유)
    S->>PG: 명령 → 쓰기 + outbox
    Dev->>B: bun run dev
    B->>App: 4개 프로세스 병렬 기동 (--watch)
    App->>PG: 설정 검증 후 연결, worker 가 outbox 처리
    Dev->>Dev: http://localhost:8080 접속
```

### 2.3 로깅 옵션과 호스트 아카이브 (ADR-027, 제안/미검증)

| 항목 | 내용 |
|---|---|
| 컨테이너 로깅 | 모든 서비스 `logging: { driver: json-file, options: { max-size: "20m", max-file: "10" } }` (컨테이너당 최대 약 200MB). 개발 오버라이드는 기본값 사용 |
| 호스트 아카이브 | `$PF_LOG_DIR/archive/YYYY-MM-DD/<service>.jsonl.gz` — `PF_LOG_DIR` 기본 `/var/log/pf`(`pf:pf` 0750, 파일 0640). rootless Docker 면 `~/.local/state/pf/logs`. **실제 호스트(집 PC) 권한은 S8-1 에서 재확인** |
| 실행 | **systemd 타이머로 확정**(2026-11-04): `pf-archive-logs.timer` 일 1회 03:10 → `infra/scripts/archive-logs.sh`. 백업(03:30)·pull 배포(5분)도 같은 방식. 유닛은 `infra/systemd/`, 설치는 `infra/scripts/install-systemd.sh`(제안): 유닛 복사 → `systemctl daemon-reload` → `enable --now *.timer` → `list-timers` 확인. `Persistent=true` 로 꺼져 있던 동안의 실행을 보충. cron 은 systemd 가 없는 호스트의 대체 수단 (F17 §16.1.1) |
| 상태 파일 | 각 작업이 `$STATUS_DIR/<job>/last_run.json` 을 매 실행마다 갱신 → worker 가 읽기 전용으로 마운트해 지표로 노출(F17 §16.2) |
| 조회 | `infra/scripts/logq.sh --app api --level error --since 1h` (jq 필요) |
| 개발 | 아카이브·타이머 불필요(`docker compose logs` 로 충분). **개발 모드에서는 경보를 비활성**: Grafana 는 시크릿 파일/환경변수가 없으면 alerting 프로비저닝 **전체가 실패**하므로(실측) 개발 오버라이드는 `alerting/` 프로비저닝 디렉터리를 **마운트하지 않는다** |
| 유닛 설치 | `infra/scripts/install-systemd.sh`(제안)가 `*.service.in` 템플릿의 `@PF_LOG_DIR@`·`@STATUS_DIR@` 를 `/etc/pf/pf.env` 의 **절대 경로로 치환**해 설치한다 — systemd 는 `ReadWritePaths=$VAR` 를 확장하지 않고 무시한다(실측). 설치 후 `systemd-analyze verify` 로 경고 0 확인. 실제 `pf` 사용자 실행 권한은 S8-1 |
| 메트릭 선초기화 | 앱은 기동 시 고정 열거 레이블 카운터(`pf_auth_login_failed_total{reason}` 4종 등)를 0 으로 미리 노출한다(F17 §3.2) — 개발에서 경보 규칙 시험이 첫 건을 놓치지 않게 |

## 3. 개발 환경 전제

| 항목 | 값 |
|---|---|
| Bun | **1.4.4** 고정 (`.bun-version`·`package.json#packageManager` 에 기록, tech-stack.md) |
| Docker / Compose | Docker 29.8 확인됨 |
| `psql`, `k3d`, `kubectl`, `k6` | **로컬에 없음** → `psql` 은 `docker compose exec postgres psql`, `k6` 는 `grafana/k6` 컨테이너, `k3d`·`kubectl` 은 §8 에서 설치 |
| OS | **개발 PC** 는 WSL2 (M1 로컬 측정 환경). 라이브 호스트는 네이티브 Ubuntu 24.04(ADR-033 '호스트 프로필')라 성능 수치는 호스트에서 재측정한다. 파일 감시가 느리면 프로젝트를 WSL 파일시스템 안에 둔다 |

## 4. 시드 데이터

**시드는 DB 에 직접 INSERT 하지 않고 usecase 를 통해 넣는다.** 그래야 outbox → inbox → 프로젝터 → 읽기 모델 경로가 같이 채워지고, 개발 중 시각화가 바로 보인다.

| 시나리오 | 내용 |
|---|---|
| `GuestbookBasic` | 한국어 8건 · 영어 4건 방명록 글, 이모지 반응 몇 건, 숨김 1건 |
| `AdminAndReports` | 관리자 계정(시드용 GitHub ID), 신고 큐 2건 |
| `LoadMix` (선택) | 시각화 동작 확인용 지속 이벤트 생성 (속도 인자) |

- `db:seed` 는 `APP_ENV=production` 이면 **즉시 종료**한다(운영 DB 보호).
- 재실행하면 이미 있는 시드를 건너뛴다(고정 `Idempotency-Key` 사용).
- 시드용 사용자는 실제 GitHub 계정이 아니므로 `provider_user_id` 를 `seed-` 접두의 가짜 값으로 둔다(개발 DB 에만).

```mermaid
classDiagram
    class SeedScenario {
        <<interface>>
        +name string
        +run(ctx SeedContext) void
    }
    class SeedContext {
        +commands CommandBus
        +clock Clock
        +ids IdGenerator
    }
    class SeedRunner {
        +runAll(scenarios) Result
        +guardEnvironment() void
    }
    class GuestbookBasic
    class AdminAndReports
    class LoadMix
    SeedScenario <|.. GuestbookBasic
    SeedScenario <|.. AdminAndReports
    SeedScenario <|.. LoadMix
    SeedRunner "1" o-- "*" SeedScenario
    SeedRunner ..> SeedContext
    SeedContext ..> CommandBus : 공개 usecase 만 호출
    class CommandBus {
        <<interface>>
        +dispatch(command) Result
    }
```

상속 구조는 위 인터페이스 구현(`SeedScenario <|.. …`)이 전부다. 시드는 `apps/worker/src/cli` 가 아니라 **`scripts/seed.ts`** 에 두고, 모듈은 `index` 로 내보낸 usecase 만 호출한다(B4).

## 5. 비밀값 관리

원칙: **저장소에 비밀이 없다.** 어디에 무엇이 있는지만 고정한다.

| 비밀 | 로컬 개발 | 라이브 | 저장소 |
|---|---|---|---|
| `DATABASE_URL`(비밀번호 포함, **역할별** — design/10 §5.1) | `.env` 의 `DATABASE_URL_API`·`_GATEWAY`·`_WORKER`·`_MIGRATOR`(`dev` 스크립트가 프로세스마다 `DATABASE_URL` 로 매핑) | `secrets/database_url_api`·`_gateway`·`_worker`·`_migrator`·`_backup` 파일 → 서비스별 `DATABASE_URL_FILE`(백업은 `BACKUP_DATABASE_URL_FILE`) | 없음 |
| `GITHUB_CLIENT_SECRET` | `.env` (**개발용 OAuth 앱**) | `secrets/github_client_secret` (**운영용 OAuth 앱**) | 없음 |
| `FIELD_KEYS` (필드 암호화 키링 JSON, ADR-026) | `.env` (개발용 임의 키링) | `secrets/field_keys.json` → `FIELD_KEYS_FILE` | 없음 |
| `DISCORD_WEBHOOK_URL` (Grafana 경보 연락처, **grafana 컨테이너 전용**) | 개발에서는 미설정(경보 비활성, alerting 프로비저닝 미마운트) — **운영에서 파일이 없거나 비면 Grafana 연락처가 0개가 된다** | `secrets/discord_webhook` → `DISCORD_WEBHOOK_URL_FILE` | 없음 |
| `OAUTH_STATE_SECRET` (OAuth 임시 쿠키 서명 키, 32바이트 이상) | `.env` (개발용 임의 값) | `secrets/oauth_state_secret` → `OAUTH_STATE_SECRET_FILE` | 없음 |
| Tailscale 계정·인증 키(키 방식을 쓴다면) | 호스트 `tailscaled` 로그인 | 호스트 쪽 보관(compose secrets 아님, 구현 시 확정) | 없음 |
| Grafana 관리자 비밀번호 | `.env` | `secrets/grafana_admin_password` | 없음 |
| 백업 암호화 **공개키**(`BACKUP_AGE_RECIPIENT`, 비밀 아님) | 개발에서는 미사용 | 환경변수/설정(서버에는 공개키만, ADR-026). **개인키는 서버에 두지 않고** 사용자가 오프라인 보관(복구 시험 때만 사용) | 없음 |

- `.env.example` 만 커밋한다. **비밀 항목은 값을 비워 두고**, 비밀이 아닌 항목(포트·기본값)은 개발용 값을 채운다. `.env`·`secrets/` 는 `.gitignore`.
- 라이브는 compose 의 파일 기반 secrets 를 마운트하고, 앱은 `NAME_FILE` 규약(01 §7.1)으로 읽는다. 환경변수로 비밀을 넘기지 않는다(`docker inspect` 노출 방지).
- `secrets/` 는 호스트의 저장소 **밖 경로**에 두고 권한 `0600`, 소유 사용자 한 명.
- 개발용과 운영용 **OAuth 앱·Grafana 비밀번호는 서로 다른 값**이다. 개발 `.env` 가 유출돼도 운영이 안전해야 한다.
- 회전 절차는 [10](10-security.md) §5.

```
.env.example (발췌)
APP_ENV=development
LOG_LEVEL=debug
PUBLIC_ORIGIN=http://localhost:8080
DATABASE_URL_API=postgres://pf_api_rw:CHANGE_ME@localhost:55432/pf
DATABASE_URL_GATEWAY=postgres://pf_gateway_ro:CHANGE_ME@localhost:55432/pf
DATABASE_URL_WORKER=postgres://pf_worker_rw:CHANGE_ME@localhost:55432/pf
DATABASE_URL_MIGRATOR=postgres://pf_migrator:CHANGE_ME@localhost:55432/pf
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OAUTH_STATE_SECRET=
ADMIN_GITHUB_IDS=
SESSION_COOKIE_NAME=sid
COOKIE_SECURE=false
```

## 6. GitHub OAuth 개발 설정과 시험

**개발용 OAuth App 을 별도로 만든다**(GitHub → Settings → Developer settings → OAuth Apps). 운영용은 Funnel 의 고정 주소(`https://<호스트>.<tailnet 이름>.ts.net`)가 확인된 뒤(G14) 따로 만든다 — 도메인은 구입하지 않는다(ADR-003).

| 항목 | 개발용 값 |
|---|---|
| Homepage URL | `http://localhost:8080` |
| Authorization callback URL | `http://localhost:8080/api/auth/github/callback` |
| 요청 권한(scope) | **없음(공개 프로필만)** — ADR-008 최소 권한. 이메일 scope 요청 금지 |
| 저장할 값 | Client ID → `.env`, Client Secret → `.env` (개발) |
| `ADMIN_GITHUB_IDS` | 본인 **숫자 ID** (`https://api.github.com/users/<이름>` 의 `id`) |
| (운영 앱은 별도) | 운영 OAuth 앱의 Homepage·callback 은 Funnel 의 고정 주소 `https://<호스트>.<tailnet 이름>.ts.net`(자리표시자)로 등록하고 `PUBLIC_ORIGIN` 도 같은 값으로 둔다(06 §3) |

```mermaid
sequenceDiagram
    actor U as 개발자(브라우저)
    participant P as proxy :8080
    participant A as api
    participant GH as GitHub
    U->>P: GET /api/auth/github
    P->>A: 전달
    A->>A: state · PKCE verifier 생성, 단기 쿠키에 저장
    A-->>U: 302 GitHub 인가 URL (state, code_challenge S256)
    U->>GH: 로그인·승인
    GH-->>U: 302 /api/auth/github/callback?code=…&state=…
    U->>P: GET callback
    P->>A: 전달
    A->>A: state 검증 · 쿠키의 verifier 확인
    A->>GH: 코드 교환 (code + code_verifier + client_secret)
    GH-->>A: 액세스 토큰
    A->>GH: 사용자 조회 (공개 프로필)
    GH-->>A: id · login
    A->>A: user_account upsert · 세션 발급(토큰은 해시만 저장)
    A-->>U: 302 / + 세션 쿠키 (HttpOnly)
```

시험 체크리스트(08 에서 자동화): state 불일치 → 거부 / verifier 없음 → 거부 / 허용목록 밖 ID → 일반 사용자 / 허용목록 ID → 관리자 가능 / 로그아웃 후 세션 폐기. 상세 흐름과 쿠키 규칙은 [06](06-auth.md) 가 정본이다.

## 7. Tailscale Funnel 시험 (관문 G14, Proposed)

G14 의 여섯 가지를 확인한다: ① `/ws/public`·`/ws/private` 형 WebSocket 이 Funnel 을 통과하는가 ② 유휴 타임아웃과 하트비트 주기 ③ 대역폭 한도 체감 ④ **실제 클라이언트 IP 가 어떤 헤더로든 전달되는가** ⑤ 재시작 후 주소 유지 ⑥ 인증서 갱신.

**전체가 미검증이다.** 이전 G1(Cloudflare 임시 터널, 2026-11-04 통과)은 Funnel 에 적용되지 않으므로 근거로 쓰지 않는다. Tailscale 계정과 실제 Funnel 이 필요해 로컬에서 먼저 확인할 수 없다.

**공식 문서에 근거한 전제**(tailscale.com/kb/1223/funnel, 2026-01-20 검증): 모든 플랜(무료 포함)에서 가능, 베타. 요건은 Tailscale v1.38.3+, MagicDNS, HTTPS 인증서, tailnet 정책의 funnel 노드 속성(CLI 로 켜면 자동). 주소는 `<호스트>.<tailnet 이름>.ts.net` 하위만, 포트는 443·8443·10000 만, TLS 연결만, 대역폭 제한이 있고 설정 불가(수치 비공개), TCP 프록시라 중계 서버는 복호화하지 못하고 TLS 는 우리 PC 에서 종료되며 집 IP 는 드러나지 않는다. 같은 포트에 serve 와 funnel 을 동시에 쓸 수 없고, DNS 전파는 최대 10분 걸린다. WebSocket 통과는 문서에 언급이 없다.

| 방식 | 용도 | 비고 |
|---|---|---|
| 에코 서버를 `tailscale funnel` 로 노출 | ①②③④ 먼저 확인 | `proxy` 의 평문 로컬 포트(8080)를 대상으로 한다. 명령 형식은 설치한 버전의 `tailscale funnel --help` 로 확인(버전에 따라 다름, 미검증) |
| 실제 `compose.live.yaml` 구성 | 최종 확인: 실제 호스트명·헤더·재시작·인증서 | 라이브와 같은 구성. ⑤⑥ 은 관찰 기간이 필요하다 |

```mermaid
sequenceDiagram
    actor T as 시험자
    participant FN as Tailscale Funnel (중계, 복호화 불가)
    participant TS as tailscaled (로컬, TLS 종료)
    participant PX as proxy (nginx, 평문 8080)
    participant WS as ws-gateway
    T->>TS: tailscale funnel 로 로컬 8080 노출
    T->>FN: wss://<호스트>.<tailnet 이름>.ts.net/ws/public 연결
    FN->>TS: TCP 전달 (TLS 는 PC 에서 종료)
    TS->>PX: 업그레이드 요청 유지 (HTTP)
    PX->>WS: 프록시 (Upgrade·Connection 헤더 전달)
    WS-->>T: 연결 성립 · 메시지 수신 ①
    T->>PX: GET /debug/headers (개발 전용 확인 라우트)
    PX-->>T: 수신 헤더 전체와 소켓 주소 ④
    Note over T,PX: ④ 실제 IP 를 담은 헤더가 없으면 속도 제한 기준을 세션/계정으로만 (tech-stack G14 실패 시)
```

- 확인용 라우트는 **개발 모드에서만** 존재하고 수신 헤더와 소켓 주소를 응답에 비춘다. 확인 후 제거한다.
- 클라이언트가 주소 헤더(`X-Forwarded-For` 등)를 위조해 보내도 proxy 가 버리는지(G7)를 같은 시험에서 본다.
- 결과를 ADR-022 의 관문 결과 절에 기록한다.
- OAuth 로그인은 Funnel 의 고정 주소로 등록한 콜백으로 확인한다(06 §3).

## 8. k3d 시험 절차 (개요, 관문 G8)

**명령과 옵션은 구현 시 실제로 실행하며 확정한다.** 여기는 순서와 완료 기준이다.

```mermaid
flowchart TD
    A["k3d · kubectl 설치<br/>(k3d 5.9.0)"] --> B["클러스터 생성<br/>기본 ingress 비활성, 호스트 8081 → 클러스터 80"]
    B --> C["Gateway API CRD v1.7.0 설치"]
    C --> D["Envoy Gateway v1.9.3 설치"]
    D --> E["이미지 로드<br/>(k3d image import)"]
    E --> F["infra/k8s 적용<br/>Namespace · Deployment · Service · Gateway · HTTPRoute"]
    F --> G{"/api · /ws · / 라우팅 확인?"}
    G -- "예" --> H["롤링 업데이트 + 재접속 시험 (08)"]
    G -- "아니오" --> I["G8 실패: 다른 Gateway API 구현체 검토"]
```

| 단계 | 완료 기준 |
|---|---|
| 클러스터 | `kubectl get nodes` 정상, 호스트 `8081` 이 클러스터로 닿음 |
| Gateway | `GatewayClass`·`Gateway` 가 Accepted/Programmed |
| 라우팅 | `GET /api/me`(업무 경로)·`/`·`wss:///ws/public` 모두 응답 (HTTPRoute 로 WebSocket 동작은 **실측**). 운영 경로 `/healthz`·`/readyz` 는 앱 루트에 있고 프록시가 외부에 전달하지 않으므로 라우팅 확인에 쓰지 않는다(probe 는 클러스터 내부에서) |
| 롤링 | `ws-gateway` 롤링 중 클라이언트가 재접속·복구(ADR-014), 유실·중복 없음 |
| 정리 | `bun run k3d:down` 으로 완전 삭제, 재생성이 재현됨 |

Postgres 는 클러스터 안 StatefulSet 이고, 마이그레이션은 Job 이다(`db:migrate` 와 같은 코드). 이 환경은 **라이브가 아니라 "K8s 에서도 돈다"의 검증본**이다(ADR-002).

## 9. 미결

| 항목 | 결정 시점 |
|---|---|
| 호스트 포트 기본값(`55432`, `3030`, `8080`, `8081`) 확정 | 구현 시작 시 충돌 확인 |
| Funnel 의 WebSocket·대역폭·클라이언트 IP·재시작·인증서 | 관문 G14 (계정 필요) |
| nginx 이미지의 realip 포함 여부 | 관문 G7 |
| `backup` 실행 형태(호스트 cron vs 컨테이너) | M1 후반 (ADR-023) |
| ~~k3d 클러스터 옵션 상세~~ | G8 로컬 통과(F17 §16). 설치는 CRD 충돌 우회 필요(`--server-side` + `crds.enabled=false`) |
