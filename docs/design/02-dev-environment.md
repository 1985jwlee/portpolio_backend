# 02. 개발 환경

로컬에서 **처음 클론한 뒤 사이트가 뜨기까지**와, 로컬에서 **터널·OAuth·K8s** 를 시험하는 방법을 고정한다.
근거: ADR-002(Compose 라이브 · k3d 검증) · ADR-003(진입) · ADR-022(관문) · ADR-023(백업) · [01](01-repository-structure.md)(스크립트·환경변수).

> 다이어그램 해당 여부 — 순서도: 개발 모드 선택(§1) / 시퀀스: 로컬 기동(§2.2), OAuth 로그인 시험(§6), 터널 시험(§7) / 클래스·상속: 시드 실행기(§4)만 해당. compose·k3d 는 선언형 구성이라 클래스가 없다.

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
| `infra/compose/compose.live.yaml` | 라이브 오버라이드: GHCR 이미지, `restart`, `cloudflared`, 포트 비공개, 비밀 파일 마운트 |

| 서비스 | 이미지(고정 방침) | 컨테이너 포트 → 호스트(개발) | 볼륨 | 헬스체크 |
|---|---|---|---|---|
| `postgres` | `postgres:18-alpine` | 5432 → **55432** | `pgdata` | `pg_isready` |
| `proxy` | nginx (realip 포함 여부 G7) | 8080 → **8080** | `infra/nginx` 읽기 전용 마운트 | `GET /nginx-health` |
| `prometheus` | `prom/prometheus` 3.15.x | 9090 → 9090 | `prometheus-data` | `/-/ready` |
| `grafana` | `grafana/grafana` 13.3.x | 3000 → **3030** (web 과 충돌 회피) | `grafana-data`, 프로비저닝 마운트 | `/api/health` |
| `web` · `api` · `ws-gateway` · `worker` | `ghcr.io/<owner>/pf-web` · `pf-server` | 3000 · 3001 · 3002 · 3003 | — | `/readyz` (worker 는 `/healthz`) |
| `cloudflared` | `cloudflare/cloudflared` | — | — | (라이브 전용) |
| `backup` | 호스트 cron 또는 컨테이너 (ADR-023) | — | `backups` (DB 볼륨과 **다른 경로**) | 마지막 성공 시각 지표 |

- 호스트 포트 `55432`·`3030` 은 충돌 회피용 **기본 제안값**이다(로컬에 이미 PostgreSQL/다른 3000 서비스가 있을 수 있다). 바꾸면 `.env` 의 `DATABASE_URL` 도 같이 바꾼다.
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

## 3. 개발 환경 전제

| 항목 | 값 |
|---|---|
| Bun | **1.4.4** 고정 (`.bun-version`·`package.json#packageManager` 에 기록, tech-stack.md) |
| Docker / Compose | Docker 29.8 확인됨 |
| `psql`, `k3d`, `kubectl`, `k6` | **로컬에 없음** → `psql` 은 `docker compose exec postgres psql`, `k6` 는 `grafana/k6` 컨테이너, `k3d`·`kubectl` 은 §8 에서 설치 |
| OS | WSL2 (측정 환경과 같음). 파일 감시가 느리면 프로젝트를 WSL 파일시스템 안에 둔다 |

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
| `DATABASE_URL`(비밀번호 포함) | `.env` | `secrets/database_url` 파일 → `DATABASE_URL_FILE` | 없음 |
| `GITHUB_CLIENT_SECRET` | `.env` (**개발용 OAuth 앱**) | `secrets/github_client_secret` (**운영용 OAuth 앱**) | 없음 |
| Cloudflare Tunnel 토큰 | (로컬 시험 시 일회용) | `secrets/tunnel_token` | 없음 |
| Grafana 관리자 비밀번호 | `.env` | `secrets/grafana_admin_password` | 없음 |
| 백업 암호화 키 | 개발에서는 미사용 | `secrets/backup_key` + **별도 오프라인 사본** | 없음 |

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
DATABASE_URL=postgres://pf:CHANGE_ME@localhost:55432/pf
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ADMIN_GITHUB_IDS=
SESSION_COOKIE_NAME=sid
COOKIE_SECURE=false
```

## 6. GitHub OAuth 개발 설정과 시험

**개발용 OAuth App 을 별도로 만든다**(GitHub → Settings → Developer settings → OAuth Apps). 운영용은 도메인이 정해진 뒤 따로 만든다.

| 항목 | 개발용 값 |
|---|---|
| Homepage URL | `http://localhost:8080` |
| Authorization callback URL | `http://localhost:8080/api/auth/github/callback` |
| 요청 권한(scope) | **없음(공개 프로필만)** — ADR-008 최소 권한. 이메일 scope 요청 금지 |
| 저장할 값 | Client ID → `.env`, Client Secret → `.env` (개발) |
| `ADMIN_GITHUB_IDS` | 본인 **숫자 ID** (`https://api.github.com/users/<이름>` 의 `id`) |

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

## 7. Cloudflare Tunnel 로컬 시험 (관문 G1)

G1 의 두 가지를 확인한다: ① WebSocket 이 터널을 통과하는가 ② `CF-Connecting-IP` 가 붙어 nginx 에서 읽히는가. **통과 전에는 둘 다 가정이다.**

| 방식 | 용도 | 비고 |
|---|---|---|
| 임시 터널(`cloudflared tunnel --url http://localhost:8080`) | 빠른 확인 (임시 공개 주소 발급) | 공식 한도·제약(동시 요청 수, SSE 등)을 G1 때 문서로 재확인. **WebSocket 통과 여부는 이 방식으로 먼저 본다** |
| 이름 있는 터널 + 소유 도메인 | 최종 확인: 실제 호스트명·헤더 | 계정·DNS 필요(무료, A-006). 라이브와 같은 구성 |

```mermaid
sequenceDiagram
    actor T as 시험자
    participant CF as Cloudflare 엣지
    participant CD as cloudflared (로컬)
    participant PX as proxy (nginx)
    participant WS as ws-gateway
    T->>CD: 터널 기동 (대상 localhost:8080)
    T->>CF: wss://<터널 호스트>/ws/public 연결
    CF->>CD: 전달
    CD->>PX: 업그레이드 요청 유지
    PX->>WS: 프록시 (Upgrade·Connection 헤더 전달)
    WS-->>T: 연결 성립 · 메시지 수신 ①
    T->>PX: GET /debug/headers (개발 전용 확인 라우트)
    PX-->>T: 정규화된 클라이언트 주소 헤더 값 ②
    Note over T,PX: ② CF-Connecting-IP 가 없으면 속도 제한 기준을 세션으로만 (tech-stack G1 실패 시)
```

- 확인용 라우트는 **개발 모드에서만** 존재하고 클라이언트 주소 헤더를 응답에 비춘다. 확인 후 제거한다.
- 클라이언트가 같은 이름의 헤더를 위조해 보내도 proxy 가 버리는지(G7)를 같은 시험에서 본다.
- 결과를 ADR-022 의 관문 결과 절에 기록한다.

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
| 라우팅 | `/api/healthz`·`/`·`wss:///ws/public` 모두 응답 (HTTPRoute 로 WebSocket 동작은 **실측**) |
| 롤링 | `ws-gateway` 롤링 중 클라이언트가 재접속·복구(ADR-014), 유실·중복 없음 |
| 정리 | `bun run k3d:down` 으로 완전 삭제, 재생성이 재현됨 |

Postgres 는 클러스터 안 StatefulSet 이고, 마이그레이션은 Job 이다(`db:migrate` 와 같은 코드). 이 환경은 **라이브가 아니라 "K8s 에서도 돈다"의 검증본**이다(ADR-002).

## 9. 미결

| 항목 | 결정 시점 |
|---|---|
| 호스트 포트 기본값(`55432`, `3030`, `8080`, `8081`) 확정 | 구현 시작 시 충돌 확인 |
| 임시 터널의 WebSocket·제약 | 관문 G1 |
| nginx 이미지의 realip 포함 여부 | 관문 G7 |
| `backup` 실행 형태(호스트 cron vs 컨테이너) | M1 후반 (ADR-023) |
| k3d 클러스터 옵션 상세 | 관문 G8 |
