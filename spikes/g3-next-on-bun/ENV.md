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

## 이번 환경이 이전 스파이크와 다른 점
G2·G14 의 ENV.md 는 ‘i5-12400·WSL2 Ubuntu 24.04·RAM 15GB’ 를 적었고 G4·G5·G7 은 그 기록을 따랐다. **이 시험은 다른 PC(Ryzen 노트북, Ubuntu 22.04)에서 돌렸다.** 같은 ‘개발 PC’ 로 묶어 비교하지 않는다.

## 한계
- 호스트(Xeon 1.9GHz, 네이티브 Ubuntu 24.04)가 아니다. 호스트 재측정이 S0-3 의 남은 항목이다.
- **기준 10(Docker)과 Node 22 비교를 못 했다.** 기준 9 의 원인(Next 인지 Bun 인지)을 가르려면 Node 22 로 같은 조건을 재야 한다.
- 기준 9 의 ‘처리 중 요청’ 부분은 시험 설계에 경합이 있다(notes.md §4).
- 최소 앱이다. 실제 앱의 번들 크기·R3F·shadcn 은 없다. Chromium 하나만 봤다.
