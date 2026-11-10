# G3 — Next.js 를 Bun 으로 실행 (S0-3)

[tech-stack §11](../../docs/domains/tech-stack.md) 관문 G3, [design/11 S0-3](../../docs/design/11-implementation-plan.md), nonce CSP·동적 렌더 결정은 [design/10 §2](../../docs/design/10-security.md), `proxy.ts` matcher 는 [design/01 §8.5](../../docs/design/01-repository-structure.md). **제품 코드가 아니다**(스파이크). 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md).

> 이전 로컬 결과(tech-stack §11.1 G3: 빌드 약 5.9초·standalone 41MB·Docker 341MB 등)는 재현 스크립트가 없어 ‘참고값(재현 불가)’ 이다. 이 폴더가 재현 스크립트를 대신하고, 호스트(네이티브 Ubuntu 24.04, Xeon 1.9GHz)에서 다시 재는 것이 S0-3 의 남은 항목이다.

## 이 시험이 묻는 것
Next 는 Bun 실행을 공식 보증하지 않는다(Node ≥ 20.9). **“우리가 쓰는 기능 조합이 Bun 에서 정상인가”** 만 본다 — 빌드, standalone 실행, 로케일 협상(`proxy.ts`), 요청별 nonce CSP 와 하이드레이션, `next/image`(sharp), 우아한 종료, Docker 이미지. 실패하면 web 만 Node 22 LTS 로 바꾼다.

## 환경 고정
Bun 1.4.4, `next` 16.4.5, `react`·`react-dom` 19.3.1, `next-intl` 4.14.10, `@playwright/test` 1.64.1(하이드레이션 확인용, 개발 의존성). 모두 정확히 고정하고 `bun.lock` 을 커밋한다. 설치 직후 `bun.lock` 에 기록된 실제 버전이 이 표와 다르면 **이 표를 먼저 고치고** 시험한다.

## 구성
| 파일 | 역할 |
|---|---|
| `src/proxy.ts` | next-intl 로케일 협상 + 요청별 nonce CSP(`style-src-attr 'unsafe-inline'` 만 좁게 연다 — design/10 §2 후보 (a)). matcher 는 design/01 §8.5 의 형태 |
| `src/app/[locale]/…` | 동적 렌더 페이지. 서버 컴포넌트(번역·`headers()`), 클라이언트 컴포넌트(카운터 — 하이드레이션 확인), `next/image` |
| `src/app/healthz`, `src/app/api/time` | 로케일 협상에서 제외돼야 하는 경로 |
| `Dockerfile` | `oven/bun:1.4` 멀티스테이지(빌드→standalone), 헬스체크 `bun -e fetch` |
| `verify.ts` | 빌드·서버·브라우저·컨테이너를 돌려 아래 기준을 시험하고 `results/` 에 원시 결과를 남긴다 |

## 시험 전에 고정한 기준 (2026-11-10) — `bun verify.ts`
종료 코드만으로 판정하지 않는다. **응답 본문·헤더·파일·프로세스 상태**로 판정하고, 서버 stderr 에 예외가 찍히면 그 기준은 실패다(G5 에서 stderr 의 NaN 예외를 놓칠 뻔한 경험).

| # | 기준 | 합격 |
|---|---|---|
| 1 | `bun --bun next build` 가 성공하고 `.next/standalone/server.js` 와 `.next/static` 이 생긴다. 빌드 출력에 `Error`·`Failed` 없음 | 종료 코드 0 + 파일 존재 + 오류 문자열 0 |
| 2 | standalone 을 `bun server.js` 로 띄우면 `/ko`·`/en` 이 200 이고 HTML 에 각 로케일의 번역 문구가 들어 있다(서버 렌더). 이 기준을 포함한 모든 응답에서 stderr 예외 0 | 두 로케일 모두 문구 일치 |
| 3 | `/` 는 `/ko`(Accept-Language 없음)로, `Accept-Language: en` 이면 `/en` 으로 307/308 이동한다 | 일치 |
| 4 | `/healthz`·`/api/time` 은 **리다이렉트 없이 200** 이고 본문이 맞다(matcher 제외 확인 — 제외하지 않으면 `/en/…` 로 가서 404 였다) | 둘 모두 200, `location` 헤더 없음 |
| 5 | 매 요청마다 `Content-Security-Policy` 의 nonce 가 **달라지고**, HTML 의 모든 `<script>` 태그가 그 요청의 nonce 를 가진다(nonce 없는 `<script>` 0). 페이지는 동적 렌더다(`x-nextjs-cache` 가 `HIT` 이 아니고 `cache-control` 에 `s-maxage` 가 없음) | 10회 요청에서 nonce 10종, 누락 0 |
| 6 | **하이드레이션**: 실제 브라우저(Chromium)에서 `/ko` 를 열고 카운터 버튼을 3번 누르면 화면 값이 3 이 된다. 콘솔에 CSP 위반(`Content Security Policy`) 0건 | 값 3, 위반 0 |
| 7 | **`style-src-attr` 만 좁게 여는 안(design/10 §2 후보 (a))**: `style-src 'self' 'nonce-…'` + `style-src-attr 'unsafe-inline'` 에서 `next/image` 의 인라인 style 속성이 위반을 내지 않는다. 같은 페이지에서 `style-src-attr` 를 빼면 위반이 난다(대조) | 열면 0건, 빼면 ≥ 1건 |
| 8 | `next/image`: `/_next/image?url=/sample.png&w=64&q=75` 가 200, `content-type` 이 `image/webp` 또는 `image/avif`, 본문 크기가 원본보다 작다(sharp 가 Bun 에서 로드됨) | 일치 |
| 9 | 우아한 종료: 서버에 SIGTERM 을 보내면 **10초 안에** 종료하고 종료 코드는 143(또는 0) 이다. 요청 처리 중이던 응답은 끝까지 온다 | 일치 |
| 10 | Docker: `Dockerfile` 로 이미지를 빌드해 컨테이너를 띄우면 헬스체크가 `healthy` 가 되고 `/ko` 가 200 이다. 이미지 크기를 기록한다 | healthy + 200 (크기는 관찰) |
| 11 | 위 1~10 을 3회 반복해도 같다(반복마다 `.next` 를 지우고 서버를 새로 띄움) | 3/3 |

### 관찰(판정 아님)
- 빌드 시간, standalone 크기, 이미지 크기.
- 부하 후 RSS 와 `/ko` 평균 응답 시간(30초, 동시 10). 같은 앱을 **Node 22 LTS**(`node:22`)로 띄운 값과 나란히 적는다 — 이전 비교는 Node 25 였다(참고치).
- `bunx shadcn` CLI 호환은 이 시험 범위 밖이다(S5-1 에서 확인).

## 발견 기록 (2026-11-10, 첫 실행 뒤 — 기준은 바꾸지 않았다)
- **하네스 결함:** 결과를 쓰는 마지막 줄이 `docker` 없는 PC 에서 `docker --version` 의 빈 stdout 때문에 예외로 죽었다(시험 본체는 끝까지 돌았다). 한 줄 고쳤고 기준과 무관하다.
- **기준 9 실패(1/3), 서버 쪽 발견:** SIGTERM 은 듣고 종료 코드도 143 이지만, **요청이 처리 중이거나 막 처리된 시점에 SIGTERM 이 오면 종료에 6.7~13.6초가 걸린다**(접속이 없거나 유휴 연결만 남았을 때는 0.1초). 응답은 정상 도착한다. `KEEP_ALIVE_TIMEOUT=1000` 으로도 8.9초라 keep-alive 만으로는 설명되지 않는다. **원인은 모른다**(Next 인지 Bun 의 `node:http` 호환인지) — Node 22 로 같은 조건을 재야 가른다. 원문: [results/notes.md](results/notes.md).
- **기준 9 시험 설계 결함:** ‘처리 중 요청’ 을 보낸 직후 곧바로 SIGTERM 을 보내 요청이 연결되기 전에 거부되는 경합이 있다(본 시험 2회차). 결과를 본 뒤 기준을 바꾸지 않으려고 이번에는 고치지 않았다. 다음 판에서 ‘연결 확립 뒤 SIGTERM’ 으로 바꾸고 ‘발견 후 수정’ 으로 표시한다.
- **환경 의존:** Chromium 공유 라이브러리가 없어 `apt-get download` + `dpkg -x` 로 홈에 풀어 `LD_LIBRARY_PATH` 로 지정했다([ENV.md](ENV.md)). `bunx` 는 수동 설치에 없어 `bun x` 를 썼다.

## 실행
```bash
cd spikes/g3-next-on-bun
bun install --frozen-lockfile           # 첫 설치는 --frozen-lockfile 없이, 뒤에 bun.lock 커밋
bunx playwright install chromium        # 기준 6·7 (약 150MB)
bun verify.ts                           # 전부(3회 반복 포함)
bun verify.ts --only=5 --runs=1         # 한 기준만 빠르게
```
호스트(Docker 만 있고 Bun 없음)에서는 `oven/bun:1.4` 컨테이너 안에서 돌린다:
```bash
docker run --rm -v "$PWD:/app" -w /app oven/bun:1.4 bun install && \
docker run --rm -v "$PWD:/app" -w /app --network host oven/bun:1.4 bun verify.ts --skip=6,7,10
```
호스트에서는 브라우저(6·7)와 Docker 중첩(10)을 컨테이너 안에서 못 돌리므로 **개발 PC 에서 6·7·10 을, 호스트에서 1~5·8·9와 관찰값을** 잰다. 어느 기준을 어디서 돌렸는지 `ENV.md` 에 적는다.

## 한계 (결과에 병기한다)
- 최소 앱이다. 실제 앱의 번들 크기·페이지 수·R3F(3D)·shadcn 컴포넌트는 없다. 이 시험이 통과해도 ‘이 기능 조합에서 문제를 못 찾았다’일 뿐이다.
- Next 의 Bun 호환은 버전마다 달라질 수 있다 — 버전을 올리면 다시 돌린다(CI `web build` 가 매 PR 에서 빌드만 확인한다, design/09).
- 브라우저는 Chromium 하나다. Safari·Firefox 의 CSP 처리는 보지 않는다.
- 호스트의 CPU(Xeon 1.9GHz)는 코어당 클럭이 낮아 빌드·응답 시간이 개발 PC 와 다르다. 시간 수치는 기준이 아니라 관찰이다.
