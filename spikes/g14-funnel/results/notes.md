# G14 관찰 기록 (2026-11-10) — 스크립트로 못 잰 것·사람이 붙여 준 출력의 원문

요약이 아니라 원문을 둔다. 해석은 [ADR-051](../../../docs/adr/ADR-051-funnel-g14-measurement-results.md). 시각은 UTC(서버 로그·결과 JSON)와 KST(서버 셸 출력)가 섞여 있다(KST = UTC+9).

## 1. 서버에서 사용자가 실행한 출력

### `tailscale netcheck` (10:43:51 KST, 일부 생략: 먼 지역 DERP 지연)
```
        * UDP: true
        * IPv4: yes, <SERVER_PUBLIC_IP>:53236
        * IPv6: no, but OS has support
        * MappingVariesByDestIP: false
        * PortMapping:
        * CaptivePortal: false
        * Nearest DERP: Tokyo
        * DERP latency:
                - tok: 36.6ms  (Tokyo)
                - hkg: 86.9ms  (Hong Kong)
                - sin: 93.2ms  (Singapore)
```

### 서버 → 중립 호스트 직접 업로드 (Funnel 을 거치지 않음)
```
$ head -c 50000000 /dev/zero | curl -s -o /dev/null -w 'upload: %{speed_upload} bytes/s  time: %{time_total}s\n' --data-binary @- https://speed.cloudflare.com/__up
upload: 12128774 bytes/s  time: 4.122428s
```
1회 측정이다(반복·최악값 판정 미실시 — design/08 §9 에 못 미친다).

### Funnel 재시작 타임라인 (콜드 스타트 재현용, 서버 셸 출력)
```
01:56:31.950067100   (date -u, reset 직전 — 비밀번호 입력 대기 포함)
01:56:38.429482385   (reset 직후)
01:56:58.434615809   (다시 켜기 직전, sleep 20 이후)
01:56:58.470768861   (다시 켠 직후)
```
이 시각과 `results/…ws-watch-p461486.json` 의 시도별 시각을 대조한다.

### 유휴 시험의 서버 쪽 로그 (`docker logs g14-echo`)
```
{"t":"2026-11-10T01:54:33.821Z","ev":"close","id":5,"code":1006,"reason":"WebSocket timed out from inactivity","openMs":960001,"msgs":0,"bytes":0}
{"t":"2026-11-10T01:54:45.357Z","ev":"close","id":6,"code":1000,"reason":"cap","openMs":971479,"msgs":0,"bytes":0}
```
`id 5` = `hb=0`(무 ping), `id 6` = `hb=25`. `id 5` 는 서버(Bun)의 `idleTimeout: 960` 에 걸려 끊겼다.

### 서버 로그: Funnel 을 켠 직후의 업그레이드 도착 (원문 일부)
```
{"t":"2026-11-10T01:35:12.191Z","ev":"listening","port":3000}
{"t":"2026-11-10T01:36:50.215Z","ev":"upgrade","socketIp":{"address":"172.17.0.1","family":"IPv4","port":47142},"headers":{"accept-encoding":"gzip","connection":"Upgrade","host":"qd.tail91f132.ts.net","sec-websocket-key":"dGhlIHNhbXBsZSBub25jZQ==","sec-websocket-version":"13","tailscale-funnel-request":"?1","upgrade":"websocket","x-forwarded-for":"<CLIENT_PUBLIC_IP>","x-forwarded-host":"qd.tail91f132.ts.net","x-forwarded-proto":"https"}}
{"t":"2026-11-10T01:36:50.215Z","ev":"open","id":1,"hb":0}
{"t":"2026-11-10T01:37:10.820Z","ev":"close","id":1,"code":1006,"reason":"","openMs":20605,"msgs":0,"bytes":0}
```
- **첫 `upgrade` 가 01:36:50 이다.** 그 전에 클라이언트가 시도한 WebSocket 2건(첫 `ws-echo`, 첫 업그레이드 프로브, 약 01:36:2x~30)은 서버 로그에 없다 → 원점에 도달하지 못했다. 같은 시간대 일반 GET(01:36:42)은 성공했다.
- `id 1~3` 의 `code 1006`, 약 20.6초는 클라이언트가 `timeout 20` 으로 프로브를 강제 종료해서 생긴 것이다(Funnel 의 유휴 끊김이 아니다).
- 유휴 시험(`id 5`,`id 6`)은 01:38:33 에 열렸고 `upgrade` 헤더에는 위와 같은 `x-forwarded-for`·`tailscale-funnel-request` 가 있었다. `X-Real-IP` 는 클라이언트가 보낸 경우에만 나타난다(헤더 시험).

## 2. 이 도구가 개발 PC 에서 낸 대조 출력

### 개발 PC → 중립 호스트 다운로드 (`control-download.ts`, 클라이언트 회선이 병목인지 확인)
```
{"bytes":30000000,"sec":0.46,"mbPerSec":62.02}
```

### 클라이언트 시계 vs 서버 시계 (`control-clock-rate.ts`, 40초)
```
{"serverSec":43.398,"clientMonotonicSec":40.52,"clientWallSec":45.84,"monotonicVsServer":0.9337,"wallVsServer":1.0563}
```
`clientWallSec` 는 요청 왕복 편차(`rtt/2` 보정)가 섞여 신뢰도가 낮다. `monotonicVsServer` 가 유휴 시험의 비율(889.2/960.0 = 0.926)과 일치해서 근거로 쓴다.

## 3. 아직 관찰하지 못한 것 (2차 측정 뒤에도 남은 것)
- ⑥ 인증서 **갱신** (만료일만 기록함, 아래 4절)
- 호스트 재부팅 후 주소 유지 (공유 호스트라 시험하지 않음)
- 시간 변동의 원인(제한이 걸리는지, 경로가 바뀌는지), 한 시간 이상 쉰 뒤 처리량 회복 여부
- 서버 자신을 출발지로 한 병렬 16에서의 리셋 원인
- 클라이언트 IP: IPv6 클라이언트, 클라이언트가 `X-Forwarded-For` 를 여러 값/긴 값으로 보낼 때의 정규화

## 4. 2차 측정 (2026-11-10 04:14~04:44 UTC) — 사용자가 서버에서 실행한 출력과 대조 시험

### 실행 방법과 커밋
저장소를 서버 호스트가 아니라 Docker 볼륨(`g14src`)에 `git clone --depth 1` 로 받아 읽기 전용으로 붙였다. 실행 코드의 커밋:
```
5e1ffb82e1ef93b3639297c0a7ef78f59a8c1900
```
서버 쪽 Bun 은 1.3.11(`oven/bun:1`), 개발 PC 는 1.4.4. Funnel 을 다시 켠 시각은 04:14 UTC(서버 셸 출력의 컨테이너 시작 `04:14:27.236Z`).

### ⑥ 인증서 (개발 PC 에서 `openssl s_client`, 04:14:54 UTC)
```
subject=CN = qd.tail91f132.ts.net
issuer=C = US, O = Let's Encrypt, CN = YE1
notBefore=Nov 10 00:37:17 2026 GMT
notAfter=Feb  8 00:37:16 2027 GMT
serial=06AFD3227F1F9CA2A70F6BBE173B1477FD6A
```
발급 시각이 오늘 측정 시작(01:35 UTC)보다 앞서므로 이전 Funnel 시험 때 자동 발급된 것으로 보인다. 갱신은 관찰하지 못했다.

### ⑤ `tailscaled` 재시작 (서버 셸 출력 원문, 시각 UTC)
```
04:38:20.378989974
# Funnel on:  https://qd.tail91f132.ts.net  (/ proxy http://127.0.0.1:28080)
04:38:21.628367114     ← sudo systemctl restart tailscaled 직후
04:38:41.633158407
# Funnel on:  https://qd.tail91f132.ts.net  (/ proxy http://127.0.0.1:28080)
100.81.216.0  qd  1985jwlee@  linux  -
```
`results/…04-37-55-168Z-ws-watch-p878053.json` 의 시도별 기록과 대조: 04:38:19.9 와 04:38:29.9 의 시도가 5초 타임아웃으로 실패, 첫 성공은 04:38:36.9 → **재시작 시작에서 외부 복구까지 약 16초**.

### 서버 자신을 출발지로 (같은 서버의 컨테이너가 자기 공개 주소로 접속)
```
headers → "status": 200, "x-forwarded-for": "<SERVER_PUBLIC_IP>"   (서버 자신의 공인 IP)
throughput --par=1  (15MB)       : mbPerSec 0.28,  totalSec 52.97
throughput --par=4  (15MB × 4)   : mbPerSec 0.36 / 0.41 / 0.43 / 0.32, aggregateMbPerSec 1.26, totalSec 47.56
throughput --par=16 (15MB × 16)  : error: The socket connection was closed unexpectedly … code: "ECONNRESET"
                                   (제 도구가 병렬 흐름의 오류를 잡지 않아 실행이 중단됨 — 어느 시점인지 미기록)
```
결과 JSON 은 볼륨 안에 남았다가 정리 때 삭제된다(출력만 보존).

### 동시 시험 시도 (실패)
시작 시각 `AT=1794285266459` (= 04:34:26 UTC). 서버 쪽은 `시작까지 189초 대기` 를 출력한 뒤 시작 직후 `ECONNRESET` 으로 종료했다. 개발 PC 쪽은 병렬 4 합계 **0.64MB/s**(`results/…04-30-56-481Z-throughput-p846291.json`, 파일명 시각은 대기를 시작한 시각이다). 서버 쪽이 끊겨 ‘두 출발지 동시’ 비교는 성립하지 않았다.

### 개발 PC 단독 재측정 (04:36:10 UTC, 같은 조건)
```
병렬 4, 10MB × 4: 0.31 / 0.36 / 0.12 / 0.14 MB/s, aggregateMbPerSec 0.5, totalSec 80.71
```
01:46 UTC 의 같은 조건(2.28MB/s)과 4.5배 차이. 동시 시험의 영향이 아니라 시간에 따른 변동이다.

### 대조: 두 회선은 그대로였다
```
서버 → 중립 호스트 직접 업로드 (04:4x UTC, 2회):
upload: 12131293 bytes/s  time: 4.121572s
upload: 12140519 bytes/s  time: 4.118440s
개발 PC → 중립 호스트 다운로드 (04:43 UTC, 3회, control-download.ts):
{"bytes":30000000,"sec":0.49,"mbPerSec":58.34}
{"bytes":30000000,"sec":0.5,"mbPerSec":56.73}
{"bytes":30000000,"sec":0.6,"mbPerSec":47.98}
```
오전(01시대)의 12.1MB/s, 62MB/s 와 같은 수준이다 → 느려진 구간은 두 회선이 아니라 **Funnel 경로**.

### 휴대폰(iPhone Safari, 모바일 데이터)
서버 로그의 `ev=report` 두 건을 `results/…phone-report-*.json` 에 옮겼다(각 보고의 `startedAt` 이 시각이다). 첫 보고는 병렬 4 단계에서 `TypeError: Load failed` 로 중단, 두 번째는 끝까지 갔지만 회선이 나빴다(작은 메시지 왕복 p50 950ms, 단일 다운로드 0.08MB/s). 같은 기기·장소에서 5분 사이 7배 차이가 나 **판정에 쓰지 않는다**.


## 3차 측정 (2026-11-12 14:47~14:58 UTC) — 시간 변동 관찰
서버: 이 PC 의 `git archive HEAD spikes/g14-funnel` 을 ssh 로 `docker cp` 해 `oven/bun:1`(1.3.11) 컨테이너 `g14-echo` 로 띄웠다(서버에 저장소를 받지 않음, `HEAD` = `c2f6069`). Funnel 은 서버에서 `sudo tailscale funnel --bg --https=443 http://127.0.0.1:28080` 로 켰다. 토큰 없는 요청은 404, 있는 요청은 응답했다. 서버 loadavg 는 시작 0, 14:50 에 0.42/0.10/0.03.

### 개발 PC(이 PC, 한국 회선) — 원시 `results/2026-11-12T14-4*·14-50*-throughput-*.json`
| 시작(UTC) | 조건 | 합계 MB/s | 비고 |
|---|---|---|---|
| 14:48:00 | `throughput` 기본(WS 10연결 + 50MB 단일) | 0.47 (107초) | WS 쪽은 오류 1건(`errors: 1`)으로 0 메시지 |
| 14:49:55 | 단일 5MB | 0.29 (17초) | 지난번 단일 0.28 과 같음 |
| 14:50:37 | 병렬 4 × 15MB | **2.02** (29.6초) | 지난번 같은 조건 0.50~0.64(04:34~04:36 UTC), 2.28(01:46 UTC) |
- 14:48·14:49·14:50 는 3분 안이다. 단일 0.29~0.47 에서 병렬 4 가 2.02 로 올랐다. 병렬을 늘리면 합계가 늘었다(단일 흐름 상한이 지배).
- 예정했던 10분 간격 반복 7회는 첫 회만 하고 중단했다(사용자 결정: 지금 결과로 확보).

### 휴대폰(iPhone Safari, 모바일 데이터) — `results/…-phone-report-3~5-*.json`
| 시작(UTC) | 단일 8MB | 병렬 4 합계 | 병렬 16 합계 | WS 연결 p50 | RTT p50 |
|---|---|---|---|---|---|
| 14:52:37 | 0.70 | 0.46 | 오류(`Load failed`) | 952ms | 160ms |
| 14:54:08 | 2.55 | 1.61 | 1.54 (개별 0.10~0.54) | 454ms | 106ms |
| 14:56:18 | 2.31 | 1.02 | 0.95 (개별 0.06~0.11) | 329ms | 82ms |
- 병렬 16 은 한 번 끊기고(1회차) 두 번 완주했다. 병렬 4 → 16 으로 늘려도 합계는 늘지 않았다(1.61→1.54, 1.02→0.95).
- 같은 기기·장소에서 14:52 와 14:54 사이 단일이 3.6배(0.70→2.55) 바뀌었다.

### 못 한 것
- **출발지별 상한인지 서버 전체 상한인지는 가리지 못했다.** 휴대폰 측정(14:52~14:57)과 이 PC 측정(14:48~14:51)이 시간상 겹치지 않았다. 동시 시험은 한 번도 성립하지 않았다(1차 서버 `ECONNRESET`, 이번엔 시간 불일치).
- 시간대별 반복(원인 분리)은 첫 회 이후 중단했다.
- 호스트 무결성이 확인되지 않은 상태의 서버였다(g2-ws-soak ENV 참고).
