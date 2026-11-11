# 호스트(집 서버) 재측정 (S0-2 ‘개발 PC → 호스트’)

G2·G4·G5·G7·G10·G10b·G11 의 개발 PC 결과(WSL2 loopback, i5-12400)를 **라이브 호스트**(네이티브 Ubuntu 24.04, Xeon Bronze 3204 6코어 1.9GHz, 공유 서버)에서 다시 잰다. 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md). 이 폴더는 제품 코드가 아니고, **측정 기준은 각 스파이크 README 에 이미 고정된 것을 그대로 쓴다**(바꾸지 않는다).

## 원칙
- **서버에는 Docker 만 있으면 된다.** Bun 을 설치하지 않는다 — `Dockerfile.runner`(Bun + docker CLI + git)로 각 스파이크를 컨테이너에서 돌리고, 스파이크가 부르는 `docker run`(Postgres·nginx)은 호스트 소켓(`/var/run/docker.sock`)을 통한다.
- 소스는 `/tmp/pf-host-remeasure`(`WORK`)에 임시로 받고 끝나면 `clean` 으로 지운다. 사용자가 서버에서 명령을 직접 입력한다(이 PC 의 키는 서버에 등록돼 있지 않다).
- `--network host` 로 돌려 스파이크의 `127.0.0.1:<포트>` 가 호스트 포트와 같다. 실행기는 root 이고 소켓을 쥐므로 **호스트 root 와 같은 권한**이다(G14 의 `docker` 그룹 사용과 같은 수준 — 공유 서버라 시작 전에 확인).
- 공유 서버다(Jenkins·Gitea·MinIO·MySQL 등이 돈다). 시작 전 `loadavg(1m) > 3` 이면 중단한다(`FORCE=1` 로 무시 가능). 판정은 스크립트가 낸다 — 부하가 높았던 구간은 결과 JSON 의 `loadavg` 로 남는다.

## 단계와 소요 (예상, 실측 아님)
| 단계 | 대상 | 길이 | 비고 |
|---|---|---|---|
| `g4` `g10` `g7` `g5` `g10b` `g11` | DB 드라이버·마이그레이션·nginx 주소 정규화·지표·모듈별 마이그레이션·모듈 추출 | 각 1~3분(이미지 받는 시간 별도) | 개발 PC 에서 각 20~60초 |
| `g2-storm` | 재접속 폭풍 | 5분 + 정착 | 1000 연결 |
| `g2-churn` | 접속·해제 6만 회 | 약 25분 | |
| `g2-soak` | 소크 | **82분**(`--duration=4920`) | 개발 PC 와 같은 길이. 원래 고정 3시간 30분을 개발 PC 에서 줄인 결정(G2 README ‘계획 변경 기록’)을 호스트에도 같게 적용한다. **이 결정은 결과를 보기 전에 여기 적는다.** 판정 기준은 그대로 |

제외: Elysia 대 Bun.serve 비교(`g2-elysia-compare`, 약 2시간) — ADR-053 이 결정했고 호스트에서 `Bun.serve` 구현이 기준을 못 넘을 때만 다시 본다. G3(Next on Bun)는 사용자가 따로 했다.

## 사용
```bash
# 1) 사전 점검 (읽기 전용) — 출력을 붙여 넣는다
curl -fsSL https://raw.githubusercontent.com/1985jwlee/portpolio_backend/<브랜치>/spikes/host-remeasure/preflight.sh | bash   # 저장소가 공개일 때. 아니면 파일을 직접 옮긴다
# 2) 준비 (소스 받기 + 실행기 이미지 빌드)
REPO=<저장소 URL> BRANCH=<브랜치> ./run.sh prepare
# 3) 짧은 것부터 차례로, 각각 출력을 확인
./run.sh g4 ; ./run.sh g10 ; ./run.sh g7 ; ./run.sh g5 ; ./run.sh g10b ; ./run.sh g11
# 4) 긴 것은 끊겨도 살도록 (tmux 또는 nohup)
nohup ./run.sh g2-storm > storm.log 2>&1 &
# 5) 결과 묶기 → 가져오기
./run.sh pack        # $WORK/host-results.tgz (이번에 새로 생긴 results 파일만 + host-profile.txt)
./run.sh clean       # 소스·컨테이너 정리
```

## 한계 (시작 전에 적는다)
- 호스트는 공유 서버라 다른 서비스의 부하가 섞인다. 합격 판정은 ‘이 부하 조건에서’ 이다.
- 같은 호스트에서 서버와 부하 생성기가 돌아(loopback) 네트워크·TLS·Funnel·nginx 는 빠져 있다.
- 실행기가 root 로 호스트 도커 소켓을 쓴다. 개발 PC 결과와 **교차 비교하지 않는다**(서로 다른 장비 — 개발 PC 두 대 규칙과 같다). 호스트 합격/불합격만 말한다.
- 이미지(`oven/bun:1.4.4`·`postgres:18`·`nginx:*`)를 새로 받으므로 첫 실행은 네트워크 시간이 든다.
