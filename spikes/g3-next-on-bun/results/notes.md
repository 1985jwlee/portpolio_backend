# G3 진단 기록 (2026-11-10) — 기준 9 실패의 원인 분리

기준 9(SIGTERM 후 10초 안 종료)가 실패해 원인을 가르려고 `diag-sigterm.ts` 로 조건을 나눠 쟀다. 서버는 `.next/standalone/server.js` 를 `bun` 으로 띄운 것이고, 시험 PC 는 [ENV.md](../ENV.md) 의 WSL2 다. **스크립트는 진단 도중 세 번 고쳤고 저장소에는 마지막 판만 있다** — 앞 판의 출력은 아래에 그대로 붙인다.

## 1. 앞 판 (조건 A~F)
```
A 접속 없이 SIGTERM                        exit 143, 0.1초
B keep-alive 연결 하나 남긴 채 SIGTERM      exit 143, 0.1초
C Connection: close 요청 뒤 SIGTERM         exit 143, 0.1초
D 처리 중 요청 1개와 동시에 SIGTERM         exit 143, 0.1초, 요청은 ECONNREFUSED  ← 요청이 연결되기 전에 SIGTERM 이 도착한 경합. 결론에 쓰지 않는다
E 8초 부하(동시 10) 직후 SIGTERM            exit 143, 0.1초
F 부하 직후 + 처리 중 요청과 동시에 SIGTERM  exit 143, 13.0초, 요청은 ok
```

## 2. 마지막 판 (`diag-sigterm.ts` 그대로)
```
G1 연결 직후 SIGTERM(부하 없음)                      exit 143, 13.6초, 요청 ok
G2 같은 조건 반복                                   exit 143,  6.7초, 요청 ok
F1 부하 직후 + 처리 중 (반복)                        exit 143, 12.9초, 요청 ok
H  부하 직후 + 처리 중, KEEP_ALIVE_TIMEOUT=1000     exit 143,  8.9초, 요청 ok
```

## 3. 읽은 것
- SIGTERM 자체는 듣는다. 종료 코드는 항상 143 이다. 접속이 없거나 유휴 keep-alive 연결만 남았을 때는 0.1초에 끝난다(A·B·C·E).
- **요청이 처리 중이거나 막 처리된 시점에 SIGTERM 이 오면 종료에 6.7~13.6초가 걸린다**(F·G1·G2·F1). 부하 직후여야만 생기는 것이 아니다(G1·G2 는 부하 없음). 응답 자체는 정상으로 도착한다.
- `KEEP_ALIVE_TIMEOUT=1000`(1초)으로도 8.9초라 **keep-alive 타임아웃만으로는 설명되지 않는다.**
- **원인은 모른다.** Next 의 종료 처리인지, Bun 의 `node:http` 호환(`server.close` 가 연결을 기다리는 방식)인지 가르지 못했다. 같은 앱을 Node 22 로 띄워 같은 조건을 재면 가를 수 있다 — 아직 하지 않았다(이 PC 에 Node 가 없다).
- 값이 6.7~13.6초로 크게 흔들려 ‘항상 13초’ 도 아니다. 표본이 작다(조건당 1~2회).

## 3.1 호스트(서버)에서 같은 진단 — Bun 대 Node 22 (2026-11-11 00:1x KST 서버 시계, 컨테이너 `--cpus=3 --memory=4g`)
같은 `.next/standalone` 빌드를 `diag-sigterm.ts` 의 `SERVER_BIN` 으로 런타임만 바꿔 돌렸다(Bun 1.4.4 = `oven/bun:1.4`, Node 22.23.4 = `node:22-slim` 의 바이너리). 조건당 1회, 출력 원문:
```
== 서버 런타임: bun
G1 연결 직후 SIGTERM(부하 없음)                      exit 143, 6.2초, 요청 ok
G2 같은 조건 반복                                   exit 143, 6.2초, 요청 ok
F1 부하 직후 + 처리 중 (반복)                        exit 143, 6.1초, 요청 ok
H  부하 직후 + 처리 중, KEEP_ALIVE_TIMEOUT=1000     exit 143, 2.1초, 요청 ok
== 서버 런타임: node
G1 연결 직후 SIGTERM(부하 없음)                      exit 143, 6.2초, 요청 ok
G2 같은 조건 반복                                   exit 143, 6.2초, 요청 ok
F1 부하 직후 + 처리 중 (반복)                        exit 143, 6.1초, 요청 ok
H  부하 직후 + 처리 중, KEEP_ALIVE_TIMEOUT=1000     exit 143, 2.1초, 요청 ok
```
- **Bun 과 Node 22 의 값이 같다.** 지연은 Bun 비호환이 아니다.
- 값이 `KEEP_ALIVE_TIMEOUT + 약 1초`(기본 5초 → 6.1~6.2초, 1초 → 2.1초)로 움직인다. **요청을 처리한 keep-alive 연결을 서버 종료가 기다리는 것**과 맞는다. 코드 경로(Next 의 `server.close`)까지 확인한 것은 아니다.
- **정정:** 위 §3 의 ‘`KEEP_ALIVE_TIMEOUT=1000` 으로도 8.9초라 keep-alive 만으로는 설명되지 않는다’ 는 **노트북 값만 보고 한 해석이고 서버 결과와 어긋난다.** 노트북의 0.1~13.6초 요동은 WSL2/NTFS 환경의 잡음으로 보이나 원인을 확인하지는 못했다(WSL2 시계 지연은 G14 에서도 관찰됨). 앞 절은 당시 기록으로 남기고 지우지 않는다.

## 4. 시험 자체의 한계
- `verify.ts` 기준 9 의 ‘처리 중 요청’ 은 `fetch` 를 보낸 직후 곧바로 SIGTERM 을 보낸다. 요청이 연결되기 전에 서버가 리스너를 닫으면 거부된다(본 시험 2회차: 서버는 0.1초에 종료했고 요청이 실패해 `inflightOk=false`). **이 경합은 시험 설계의 결함이며, 결과를 본 뒤 기준을 바꾸지 않으려고 고치지 않았다.** 다음 판에서 ‘연결이 확립된 뒤 SIGTERM’ 으로 바꾸고 ‘발견 후 수정’ 으로 표시한다(`diag-sigterm.ts` 의 G 조건이 그 형태).
- 그래서 본 시험의 기준 9 는 ‘서버가 늦게 끝난다’(1·3회차)와 ‘요청이 경합으로 실패했다’(2회차)가 섞여 있다. 앞의 것만 서버 쪽 발견이다.

## 5. 호스트 기준 10 — Docker 이미지 (서버 셸 출력 원문, 3회 반복, 반복마다 이미지를 새로 빌드)
`Dockerfile` 로 `docker build` → `docker run -d --cpus=1 --memory=1g -p 127.0.0.1:39601:3000` → 헬스체크 `healthy` 대기(최대 30초) → `/ko` 요청. 빌드 컨텍스트는 `node_modules`·`.next`·`results` 를 뺀 깨끗한 폴더.
```
== 반복 1
health=healthy ko=200 imageMB=270
== 반복 2
health=healthy ko=200 imageMB=270
== 반복 3
health=healthy ko=200 imageMB=270
```
`verify.ts` 의 `dockerRun()` 이 아니라 같은 절차를 셸로 직접 돌렸다(호스트에 Bun 이 없고 `verify.ts` 가 컨테이너 안에서는 `docker` 를 부를 수 없다). 기준 문구와 합격 조건은 같다.
