# G14 — Tailscale Funnel 관문 측정

[tech-stack §11](../../docs/domains/tech-stack.md) G14 ①~⑧ 을 재는 스파이크다. **제품 코드가 아니다**(시험 후 서버를 내린다). 결과는 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md) 에 따라 **스크립트·원시 JSON·호스트 사양·커밋 해시**를 함께 커밋해야 숫자로 인정된다.

- `server.ts` — 집 서버에서 도는 에코 서버(HTTP `/echo`·`/bytes`·`/meta`, WebSocket `/ws`). **토큰(`G14_TOKEN`)이 없으면 404** 라 공개 주소에서 열려 있는 동안에도 아무나 쓸 수 없다.
- `client.ts` — 측정 쪽(개발 PC·폰 테더링 PC 등 **서버가 아닌 곳**)에서 돌린다. `results/` 에 원시 JSON 을 남긴다.

## 1. 서버(집 PC)에서 켜기
Bun 을 호스트에 깔지 않는다. 이미 있는 `oven/bun` 이미지로 돌린다.

```bash
cd <이 저장소>/spikes/g14-funnel          # 또는 server.ts 를 서버에 복사한 폴더
export G14_TOKEN=$(openssl rand -hex 16); echo "$G14_TOKEN"    # 측정 쪽에도 같은 값을 쓴다 (채팅·저장소에 올리지 않는다)
ss -ltn | grep 28080 || echo "28080 비어 있음"                  # 비어 있어야 한다
docker run -d --rm --init --name g14-echo -e G14_TOKEN \
  -p 127.0.0.1:28080:3000 -v "$PWD:/app:ro" -w /app oven/bun:1 bun server.ts
curl -s "http://127.0.0.1:28080/meta?k=$G14_TOKEN" | head -c 300; echo
sudo tailscale funnel --bg --https=443 http://127.0.0.1:28080
tailscale funnel status
```

## 2. 측정 쪽에서 돌리기
```bash
export G14_TOKEN=<위 토큰>
B=https://qd.tail91f132.ts.net
cd spikes/g14-funnel
bun client.ts headers   $B                         # ④ 클라이언트 IP 헤더 (위조 X-Forwarded-For 포함)
bun client.ts ws-echo   $B --n=200                 # ① WebSocket 통과·왕복·close 코드
bun client.ts idle      $B --hb=0  --cap=900       # ② 무 ping 유휴 타임아웃 (최대 15분 관찰)
bun client.ts idle      $B --hb=25 --cap=900       # ② 서버 hb 25초로 유지되는지
bun client.ts throughput $B --conns=10 --size=65536 --secs=15   # ③ 대역폭 체감
bun client.ts http      $B --conc=50 --total=500 --runs=3       # ⑦⑧ 동시 50, 429 여부
```
- 서버 로그(`docker logs g14-echo`)의 `upgrade` 줄에 WebSocket 업그레이드 요청의 헤더·소켓 주소가 남는다(④ 의 WS 경로).
- ⑦ 은 **한국 회선의 클라이언트**에서 재야 한다(집 LAN 에서 재면 같은 회선을 왕복한다). 폰 테더링 등 다른 회선에서 한 번, 집에서 한 번 재서 둘 다 남긴다.
- ⑦ 합격선은 제안값이다. 원점 p95(`$upstream_response_time`)는 nginx 가 붙은 뒤에야 재므로, 이번 스파이크에서는 종단 수치만 얻고 원점은 S0 이후에 잰다.

## 3. 사람이 관찰해 적을 것 (스크립트로 못 잰다)
| 항목 | 방법 | 기록 |
|---|---|---|
| ⑤ 재시작 후 주소 유지 | `sudo systemctl restart tailscaled` 와 호스트 재시작 뒤 `tailscale funnel status`·같은 주소 접속 | 시각, 전후 `funnel status`, 주소 동일 여부 |
| ⑥ 인증서 갱신 | `echo | openssl s_client -connect qd.tail91f132.ts.net:443 2>/dev/null | openssl x509 -noout -dates` | 만료일, 관찰 기간. 갱신 시점까지 못 보면 "미관찰" 로 명시 |

`results/notes.md` 에 날짜·명령·출력을 그대로 붙인다(요약만 쓰지 않는다).

## 4. 끝낸 뒤 반드시
```bash
sudo tailscale funnel reset
docker stop g14-echo
```
`G14_TOKEN` 은 버린다. 결과 JSON 에는 토큰이 들어가지 않는다(요청 경로의 `k=` 는 저장하지 않는다 — 커밋 전에 `grep -r "$G14_TOKEN" results` 로 한 번 확인).

## 5. 결과 해석 → 문서 반영
| 결과 | 반영 |
|---|---|
| ① 실패 | ADR-003 후속(SSE 등 대체) |
| ④ IP 미확보 | 속도 제한을 세션/계정 기준으로, HC-8(app read bucket) 발동 여부 판단 |
| ③ 한도 부족 | 자산 축소·재검토 |
| 전부 | `docs/domains/tech-stack.md` §11 G14 행과 ADR-022·ADR-003·ADR-008 의 "미검증" 표기를 측정 결과로 갱신, [편차 로그](../../docs/deviation-log.md) 에 설계와 달랐던 점이 있으면 한 줄 |

## 6. 2차 측정 (⑤ 재시작 · ⑥ 인증서 · ⑦ 다른 회선)
서버에는 저장소를 받아 둔다(손으로 파일을 붙여 넣지 않는다). 1차와 같은 방식으로 새 토큰을 만들어 켠다.
```bash
git clone --depth 1 --branch <브랜치> <저장소 URL> ~/pf && cd ~/pf/spikes/g14-funnel
export G14_TOKEN=$(openssl rand -hex 16)
docker run -d --rm --init --name g14-echo -e G14_TOKEN -p 127.0.0.1:28080:3000 -v "$PWD:/app:ro" -w /app oven/bun:1 bun server.ts
sudo tailscale funnel --bg --https=443 http://127.0.0.1:28080
```

**⑥ 인증서** — 어느 기기에서든(Funnel 이 켜져 있을 때):
```bash
echo | openssl s_client -connect qd.tail91f132.ts.net:443 -servername qd.tail91f132.ts.net 2>/dev/null | openssl x509 -noout -subject -issuer -dates -serial
```
만료일과 관찰 일시를 `results/notes.md` 에 적는다. 갱신은 만료 전에 일어나므로 한 번의 관찰로는 ‘갱신 확인’이 아니라 ‘만료일 기록’이다 — 다음 관찰 시점을 적어 둔다.

**⑤ 재시작 후 주소 유지** — 서버에서:
```bash
date -u; tailscale funnel status
sudo systemctl restart tailscaled; sleep 20
date -u; tailscale funnel status
```
다른 기기에서 `bun client.ts headers $B` 가 재시작 뒤에도 성공하는지, 다시 켠 뒤 처음 몇 번의 WS 접속(`ws-watch`)이 실패하는지 본다. 호스트 재부팅은 다른 서비스가 도는 공유 호스트라 이번에는 하지 않고, 다음 정기 재부팅 때 `funnel status` 를 관찰해 적는다.

**⑦ 다른 회선(휴대폰, 모바일 데이터)** — Wi-Fi 를 끄고 브라우저에서
`https://qd.tail91f132.ts.net/lab?k=<토큰>` 을 열어 ‘측정 시작’을 누른다. 결과는 서버 로그로 온다.
```bash
docker logs g14-echo 2>&1 | grep '"ev":"report"'
```
출력(접속 주소는 기록되지 않는다)을 `results/phone-<일시>.json` 으로 저장한다.

**합계 상한이 출발지별인지 전체인지(동시 시험)** — 휴대폰과 개발 PC 가 같은 시각에 병렬 4개 다운로드를 시작한다.
```bash
AT=$(( $(date +%s%3N) + 60000 ))   # 60초 뒤 (epoch ms). 이 값을 휴대폰 주소의 &at= 에 붙인다
echo $AT
# 개발 PC:
bun client.ts throughput $B --mode=http --bytes=10000000 --par=4 --at=$AT
# 휴대폰: https://qd.tail91f132.ts.net/lab?k=<토큰>&at=<위 AT>  → ‘측정 시작’ (시작 시각까지 대기)
```
해석: 두 기기 합계가 단독 합계(≈2.3~2.5MB/s)와 비슷하면 **서버 전체 상한**, 각자 단독 때와 비슷하면 **출발지별 상한**이다. 휴대폰 단독(par 1·4·16)과 개발 PC 단독 기록이 비교 기준이다.
