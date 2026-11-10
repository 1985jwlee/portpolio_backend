# results/ 색인

원시 결과는 합치지 않고 그대로 둔다(ADR-050). 이 표는 어느 파일이 무엇인지만 안내한다. 해석은 [ADR-051](../../../docs/adr/ADR-051-funnel-g14-measurement-results.md), 환경·코드 버전·한계는 [ENV.md](../ENV.md), 사람이 붙여 준 출력의 원문은 [notes.md](notes.md).

버전 열의 v1~v5 는 [ENV.md](../ENV.md) ‘코드 버전과 한계’ 의 번호다. 시각은 UTC.

| 파일 | 명령·옵션 | 무엇을 재나 (G14 항목) | 버전 | 비고 |
|---|---|---|---|---|
| `…01-35-33-325Z-headers.json` | `headers` | ④ 클라이언트 IP·위조 헤더 | v1 | 클라이언트 공인 IP 는 `<CLIENT_PUBLIC_IP>` 로 치환 |
| `…01-37-56-806Z-ws-echo.json` | `ws-echo --n=200` | ① WS 통과·왕복·close 코드 | v1 | |
| `…01-38-31-004Z-idle-hb25.json` | `idle --hb=25 --cap=900` | ② 하트비트로 유지 | v1 | `hb=0` 짝은 같은 파일명으로 **덮어써짐** → 아래 stdout 로그와 서버 로그(notes.md)로 대체 |
| `2026-11-10-idle-hb0.stdout.log` | `idle --hb=0 --cap=900` 표준출력 | ② 무 ping 유휴 | v1 | 클라이언트 시계 기준 889.2초. **서버 시계는 960.0초**(notes.md) |
| `2026-11-10-idle-hb25.stdout.log` | 같은 실행의 표준출력 | ② | v1 | JSON 파일과 같은 내용 |
| `…01-38-44-072Z-ws-connect.json` | `ws-connect --n=60 --gap=300` | ① 접속 성공률 60/60 | v2 | |
| `…01-39-35-619Z-http.json` | `http --conc=50 --total=500 --runs=3` | ⑧ 동시 50 | v2 | 오류를 `error` 한 항목으로만 집계(분류 전) |
| `…01-39-54-687Z-http.json` | `http --conc=50 --total=500 --runs=2` | ⑧ 동시 50 | v3 | 오류 분류(ECONNRESET) |
| `…01-39-59-208Z-http.json` | `http --conc=10 --total=300 --runs=1` | ⑧ 동시 10 | v3 | 오류 0 |
| `…01-40-11-116Z-http-LOCAL-control.json` | `http --conc=50` (로컬 서버) | ⑧ **로컬 대조** | v3 | Funnel 을 거치지 않음, 오류 0 |
| `…01-40-17-464Z-http.json` | `http --conc=20` | ⑧ | v3 | 오류 0 |
| `…01-40-27-026Z-http.json` | `http --conc=30` | ⑧ | v3 | 오류 0 |
| `…01-40-30-575Z-http.json` | `http --conc=40` | ⑧ | v3 | 0.6~1.6% 리셋 |
| `…01-40-34-795Z-http.json` | `http --conc=50` | ⑧ | v3 | 4.4~4.8% 리셋 |
| `…01-40-47-496Z-throughput.json` | `throughput --conns=10 --size=65536 --secs=15` | ③ WS·단일 다운로드 | v3 | 단일 흐름 0.78MB/s |
| `…01-45-46-462Z-throughput.json` | `throughput --mode=http --par=1` | ③ 단일 흐름 | v4 | 0.41MB/s |
| `…01-46-25-690Z-throughput.json` | `throughput --mode=http --par=4` | ③ 병렬 4 | v4 | 합계 2.28MB/s |
| `…01-47-04-026Z-throughput.json` | `throughput --mode=http --par=16` | ③ 병렬 16 | v4 | 합계 2.55MB/s |
| `…01-55-40-077Z-ws-watch-p461486.json` | `ws-watch --secs=300 --interval=2000` | ① 간헐 실패·정지→재개 | v5 | 서버에서 01:56:38 reset, 01:56:58 재개(notes.md) |
| `2026-11-10-ws-watch.stdout.log` | 같은 실행의 표준출력 | ① | v5 | |
| `notes.md` | — | 서버 출력 원문(netcheck, 직접 업로드, 서버 로그), 대조 시험 | — | |

저장되지 않은 관찰(Funnel 을 처음 켠 직후의 WS 실패 2건)은 [ENV.md](../ENV.md) 와 notes.md 에 서술돼 있다.
