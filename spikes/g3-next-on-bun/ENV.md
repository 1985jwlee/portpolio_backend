# G3 측정 환경 (2026-11-10)

ADR-050 의 ‘실측’ 조건(스크립트·원시 결과·환경·커밋 해시)을 채우는 기록이다. 기준은 [README.md](README.md), 원시 결과 색인은 [results/INDEX.md](results/INDEX.md), 진단 원문은 [results/notes.md](results/notes.md).

## 측정한 곳 — 개발용 노트북 하나뿐 (호스트 재측정 전)
| 항목 | 값 |
|---|---|
| 장비 | 노트북, AMD Ryzen 9 5900HX(8코어/16스레드), RAM 63.4GB(WSL2 에는 31GB·16코어가 보임) |
| OS | Windows 11 Home 10.0.26200 위의 WSL2 Ubuntu 22.04(커널 6.18.40.1-microsoft-standard-WSL2) |
| Bun | 1.4.4(`38afee6c8`). 공식 릴리스 `bun-v1.4.4` zip 을 받아 `SHASUMS256.txt` 와 대조한 뒤 WSL 홈(`~/.bun/bin`)에만 설치했다. 시스템은 건드리지 않음 |
| 패키지 | `next` 16.4.5, `react`·`react-dom` 19.3.1, `next-intl` 4.14.10, `@playwright/test` 1.64.1 (`bun.lock` 커밋). 설치 중 postinstall 2건이 Bun 기본 정책으로 차단됨: `@parcel/watcher`, `@swc/core`(next-intl 의 부수 의존성, sharp 와 무관) |
| 브라우저 | Chrome Headless Shell 156.0.8078.4(Playwright chromium v1248). 필요한 공유 라이브러리 4개(`libnspr4`·`libnss3`·`libnssutil3`·`libasound2`)가 WSL 에 없어 **`apt-get download` + `dpkg -x` 로 홈(`~/chromium-libs`)에 풀고 `LD_LIBRARY_PATH` 로 지정**했다(sudo 없음) |
| Docker | **없음** → 기준 10 미실행 |
| Node | **없음** → Node 22 비교 미실행 |
| 파일 위치 | `/mnt/d/…`(NTFS)에서 직접 실행. 빌드 31.4초(1회차 관찰) |

## 실행과 코드 버전
| 시험 | 결과 | 코드 |
|---|---|---|
| 본 시험(기준 1~9, 3회) | `results/2026-11-10T15-03-16-181Z-verify.json` | 결과 JSON 의 `commit` = `93b5743`. **다만 실행 시점의 `verify.ts` 에는 이 커밋 이후의 한 줄 수정**(`docker --version` 결과가 비어 있어도 죽지 않게)이 작업 트리에 있었다 — 기준·판정 로직은 같다. 이 수정과 결과는 다음 커밋에 담긴다 |
| 진단 | `results/notes.md`, `diag-sigterm.ts` | 같은 서버 빌드(`.next/standalone`) |

- `tsconfig.json` 은 Next 빌드가 `allowJs`·`.next/dev/types` 를 자동으로 추가해 바뀌었다(코드 변경 아님).
- 결과 JSON 의 `dirty` 판정은 쓰지 않았다(이 스파이크의 `verify.ts` 는 `commit` 만 기록한다).

## 측정한 곳 둘째 — 호스트(집 서버) (2026-11-11 00:0x~00:1x KST)
| 항목 | 값 |
|---|---|
| 장비 | Intel Xeon Bronze 3204 6코어 1.9GHz(AVX2 있음), RAM 62GB, NVMe SSD, 네이티브 Ubuntu 24.04.2 LTS(커널 6.8.0-139). ADR-033 의 호스트 프로필과 일치 |
| 공유 호스트 | Jenkins·Gitea·MySQL 등이 돌고 있다. 시험 전 load average 0.22~0.56, 시험 중 최대 1.58 |
| 실행 방식 | **컨테이너 안에서만**, `--cpus=3 --memory=4g`(다른 서비스 보호). 호스트에는 Bun·Node 를 깔지 않았다. 코어 3개 제한이라 **실제 6코어 전체를 쓴 값이 아니다** |
| Bun | 1.4.4 = `oven/bun:1.4`(`sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d`). 서버에 원래 있던 `oven/bun:1` 은 1.3.11 이라 쓰지 않았다 |
| Node | 22.23.4(`node:22-slim` 의 바이너리), 기준 9 의 원인 비교에만 사용 |
| Docker | 29.1.3(서버). 노트북엔 없었고 이전 스파이크는 29.8.0 이었다 |
| 소스 | 노트북에서 `tar` 로 보내 서버 임시 폴더(`~/g3-run`, `~/g3-docker`)에 풀었다. `bun install --frozen-lockfile` 통과. 끝난 뒤 폴더와 **제가 받은 이미지**(`oven/bun:1.4`, `node:22-slim`, 시험 이미지)를 모두 지웠다 |
| 코드 | 결과 JSON 의 `commit` = `3e4a823+작업트리(verify.ts,diag-sigterm.ts)`. 커밋 `3e4a823` 에서 `verify.ts` 의 해시·RSS 기록 두 줄과 `diag-sigterm.ts` 의 `SERVER_BIN` 만 고쳤다(컨테이너에 `git`·`ps` 가 없어서). 기준·판정 로직은 같다 |

| 시험 | 결과 | 판정 |
|---|---|---|
| 기준 1~5·8·9 (3회) | `results/host-2026-11-10T15-08-13-245Z-verify.json` | **PASS 3/3** (빌드 12~13초) |
| 기준 10 Docker (3회) | `results/notes.md` §5 | PASS 3/3 (healthy, `/ko` 200, 이미지 270MB) |
| 기준 9 원인 비교 | `results/notes.md` §3.1 | Bun 과 Node 22 가 같다(6.1~6.2초) |
| 기준 6·7 (3회) | `results/` 아래 호스트 파일은 `spikes/host-remeasure/results/g3-next-on-bun/2026-11-12T13-00-37-982Z-verify.json` | **PASS 3/3** — 아래 ‘호스트 재측정 2026-11-12’ 절 |

## 이번 환경이 이전 스파이크와 다른 점
G2·G14 의 ENV.md 는 ‘i5-12400·WSL2 Ubuntu 24.04·RAM 15GB’ 를 적었고 G4·G5·G7 은 그 기록을 따랐다(G4·G5·G7 이 어느 PC 였는지는 미확인 추정). **이 시험은 다른 PC(Ryzen 노트북, Ubuntu 22.04)에서 돌렸다.**

개발 기간 동안 두 PC(회사 PC i5-12400, 노트북 Ryzen 9 5900HX)를 **번갈아 쓸 예정**이다(2026-11-11 사용자 확인). 그래서 ‘개발 PC’ 값은 장비마다 다르다는 전제로 읽는다. 시간·처리량 수치는 두 PC 사이에서 서로 비교하지 않고, 합격 증거는 호스트 재측정으로만 만든다. 스파이크를 새로 돌릴 때는 그때 쓴 PC 를 ENV.md 에 적는다.

## 한계
- 노트북 결과(첫째 절)는 호스트가 아니다. 호스트 결과(둘째 절)는 CPU 3코어로 제한한 컨테이너 안이다.
- 브라우저 기준 6·7 은 호스트에서 2026-11-12 에 쟀다(아래 절). 단 위 둘째 절의 호스트 측정(기준 1~5·8·9·10)은 CPU 3코어 제한 컨테이너이고, 아래 절은 제한 없이 6코어 전부를 쓴 다른 실행 방식이다.
- 기준 9 의 ‘처리 중 요청’ 부분은 시험 설계에 경합이 있다(notes.md §4).
- 기준 9 의 6.1초는 Next 서버가 keep-alive 연결을 기다리는 값과 맞지만(Bun·Node 22 동일) 코드 경로까지 확인한 것은 아니다.
- 노트북의 기준 9 요동(0.1~13.6초)은 원인을 확인하지 못했다.
- 최소 앱이다. 실제 앱의 번들 크기·R3F·shadcn 은 없다. Chromium 하나만 봤다.


## 기준 9b 재시험 (2026-11-12, 개발 PC 로컬 — 호스트 아님)
- 기준 9 의 설계 결함(요청 직후 SIGTERM → 연결 확립 전 거부 경합)을 고치려고 새 기준 12(9b-1)·13(9b-2)을 추가했다. 기준 9 는 바꾸지 않았다. 사전 등록: README ‘기준 9b 사전 등록’ + `results/9b-prereg.txt`(README SHA-256). **사용자 지시로 커밋하지 않고 실행했다** — 그래서 ‘결과 전 커밋’ 이 아니라 해시 파일이 사전 등록의 증거다(약한 증거; 이후 커밋이 같은 README 를 담는다).
- 실행: `bun verify.ts --only=12,13 --skip=10 --runs=3`, Bun 1.4.4, 작업 트리가 더러운 상태(소스 `c4b819c` + 미커밋 `verify.ts`·README 변경), 시험 시작 loadavg 약 2.2. 원시: `results/2026-11-12T03-38-37-700Z-verify.json`.
- **기준 12(9b-1, keep-alive 유휴 연결 + SIGTERM): PASS 3/3** — 종료 코드 143, 매번 0.1초.
- **기준 13(9b-2, 처리 중 요청 + SIGTERM): PASS 3/3** — 응답 200 이 끝까지 왔고 종료 코드 143, 종료까지 6.6~6.7초(10초 기준 안).
- 의미: 유휴 keep-alive 만 있을 때는 즉시 끝나고, **요청이 처리 중이었던 연결이 있을 때 6.6초대**로 늘어난다 — 호스트 기준 9 의 6.1초와 같은 모양이다(Next 서버가 keep-alive 연결을 기다리는 동작). 10초 기준 안이지만 롤링 배포의 종료 유예(예: 컨테이너 stop timeout)는 이 값보다 길게 잡아야 한다.
- 한계: 로컬 1회 PC. 호스트 값은 아래 ‘호스트 재측정 2026-11-12’ 절에 있다.


## 호스트 재측정 2026-11-12 (S0-2 ‘개발 PC → 호스트’, 기준 6·7·12·13)
`spikes/host-remeasure` 의 `run.sh` 로 집 서버(Xeon Bronze 3204 6코어 1.9GHz, 네이티브 Ubuntu 24.04, Docker 29.9.3, 공유 서버)에서 쟀다. 소스는 PC 의 `git archive HEAD` 를 ssh 표준 입력으로 흘려 `oven/bun:1.4.4` 컨테이너(이미지 `pf-spike`)에 풀었다 — 서버는 원격 저장소에 접속하지 않았고 서버 파일 시스템에 소스를 두지 않았다. 컨테이너는 `--network host`, CPU 제한 없음. 끝난 뒤 이미지·볼륨을 지웠다. 기준·판정 로직은 바꾸지 않았다.

| 시험 | 단계(`run.sh`) | 원시 결과 (`spikes/host-remeasure/results/g3-next-on-bun/`) | 측정 커밋 | 판정 |
|---|---|---|---|---|
| 기준 6·7 (3회) | `g3-browser` | `2026-11-12T13-00-37-982Z-verify.json` | `ad4840f` | **PASS 3/3** — 6: 버튼 3회 → 3, CSP 위반 0 / 7: style-src-attr 열면 0건, 빼면 1건 |
| 기준 12·13 (3회) | `g3-sigterm` | `2026-11-12T13-05-15-266Z-verify.json` | `ea0d06d` | **PASS 3/3** — 12: 유휴 keep-alive, 143, 0.1초 / 13: 처리 중 요청, 200 완결, 143, 6.8초 |

- 기준 6·7 은 컨테이너 안에서 `bunx playwright install --with-deps chromium`(Chrome Headless Shell 156.0.8078.4) 로 브라우저를 넣어 `bun verify.ts --only=6,7 --skip=10` 을 돌렸다. 기준 12·13 은 `--only=12,13 --skip=10`. 기준 10(Docker 중첩)은 이번에 생략했다(앞의 호스트 절에서 PASS 3/3).
- 부하: 서버가 공유라 `FORCE=1`(부하 3 초과 무시)로 시작했다. 기준 6·7 직후 서버 loadavg(1m)는 약 1.06 이었다. 기준 12·13 실행 때는 따로 재지 않았다. 결과 JSON 에는 loadavg 가 없다.
- 판정은 ‘부분’(`PASS(부분)`)이다: `--only` 로 일부 기준만 돌려서 스크립트가 전체 PASS 로 올리지 않는다. 앞의 호스트 절(기준 1~5·8·9·10)과 이 절(6·7·12·13)을 합쳐 읽는다.
- 기준 13 의 6.8초는 개발 PC 로컬(6.6~6.7초)과 같은 모양이며 10초 기준 안이다. 장비가 달라 두 값을 교차 비교하지 않는다(호스트 합격/불합격만 말한다). 롤링 배포의 종료 유예는 이 값보다 길게(10초 이상) 잡아야 한다.
- 첫 서버 실행에서 `prepare` 가 풀린 파일의 시각을 오판해 저장소의 예전 results 를 볼륨에 복사하는 결함을 발견해 `ea0d06d` 에서 고쳤다. 기준 6·7 파일(`ad4840f`)은 그 결함이 있던 실행이지만 결과 파일은 JSON 의 시각·커밋으로 가려냈다.
- 호스트 무결성: G2 소크 후반(2026-11-11)에 서버 컨테이너의 무허가 프로세스가 CPU 를 점유한 일이 있었고 호스트 무결성은 확인되지 않았다([`../g2-ws-soak/ENV.md`](../g2-ws-soak/ENV.md) 한계). 이 절의 측정은 그 이후이고 같은 전제로 읽는다.