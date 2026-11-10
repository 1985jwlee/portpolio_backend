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

## 3. 아직 관찰하지 못한 것
- ⑤ `tailscaled`·호스트 재시작 후 주소 유지
- ⑥ 인증서 만료일·갱신
- ⑦ 다른 회선(국내 모바일 등)의 종단 성능, 출발지가 다른 동시 접속
- 클라이언트 IP: IPv6 클라이언트, 클라이언트가 `X-Forwarded-For` 를 여러 값/긴 값으로 보낼 때의 정규화
