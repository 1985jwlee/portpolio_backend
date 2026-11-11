# 호스트(집 서버) 재측정 (S0-2 ‘개발 PC → 호스트’)

G2·G4·G5·G7·G10·G10b·G11 의 개발 PC 결과(WSL2 loopback, i5-12400)를 **라이브 호스트**(네이티브 Ubuntu 24.04, Xeon Bronze 3204 6코어 1.9GHz, 공유 서버)에서 다시 잰다. 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md). 이 폴더는 제품 코드가 아니고, **측정 기준은 각 스파이크 README 에 이미 고정된 것을 그대로 쓴다**(바꾸지 않는다).

## 원칙
- **서버에 코드를 받지 않는다.** `run.sh prepare` 가 Dockerfile 을 stdin 으로 `docker build` 에 주고(컨텍스트 없음), 빌드 안에서 `git clone` 으로 저장소를 받아 이미지(`pf-spike`) 안에 둔다 — Bun + docker CLI + git + 저장소 코드 전체. 서버에는 git 도 BuildKit/buildx 도 필요 없고(클래식 빌더, `DOCKER_BUILDKIT=0`) 소스는 서버 파일 시스템에 풀리지 않는다. 결과는 도커 볼륨 `pf-results` 에 모이고 `pack` 이 tar.gz 를 표준 출력으로 내보낸다. 서버에 남는 것은 이미지·볼륨뿐이고 `clean` 이 지운다.
- 서버에는 Docker 만 있으면 된다(Bun 설치 없음). 스파이크가 부르는 `docker run`(Postgres·nginx)은 호스트 소켓(`/var/run/docker.sock`)을 통한다. 그래서 G7 은 호스트 경로 bind mount 를 `docker create → docker cp → docker start` 로 바꿨다(검사 내용·판정 기준 불변).
- `--network host` 로 돌려 스파이크의 `127.0.0.1:<포트>` 가 호스트 포트와 같다. 실행기는 root 이고 소켓을 쥐므로 **호스트 root 와 같은 권한**이다(G14 의 `docker` 그룹 사용과 같은 수준 — 공유 서버라 시작 전에 확인).
- 공유 서버다(Jenkins·Gitea·MinIO·MySQL 등). 시작 전 `loadavg(1m) > 3` 이면 중단한다(`FORCE=1` 로 무시). 판정은 스크립트가 낸다 — 부하는 결과 JSON 의 `loadavg` 로 남는다.

## 단계와 소요 (예상, 실측 아님)
| 단계 | 대상 | 길이 | 비고 |
|---|---|---|---|
| `g4` `g10` `g7` `g5` `g10b` `g11` | DB 드라이버·마이그레이션·nginx 주소 정규화·지표·모듈별 마이그레이션·모듈 추출 | 각 1~3분(이미지 받는 시간 별도) | 개발 PC 에서 각 20~60초 |
| `g2-storm` | 재접속 폭풍 | 5분 + 정착 | 1000 연결 |
| `g2-churn` | 접속·해제 6만 회 | 약 25분 | |
| `g2-soak` | 소크 | **82분**(`--duration=4920`) | 개발 PC 와 같은 길이. 원래 고정 3시간 30분을 개발 PC 에서 줄인 결정(G2 README ‘계획 변경 기록’)을 호스트에도 같게 적용한다. **이 결정은 결과를 보기 전에 여기 적는다.** 판정 기준은 그대로 |

제외: Elysia 대 Bun.serve 비교(`g2-elysia-compare`, 약 2시간) — ADR-053 이 결정했고 호스트에서 `Bun.serve` 구현이 기준을 못 넘을 때만 다시 본다. G3(Next on Bun)는 사용자가 따로 했다.

## 사용 — 서버에 파일을 두지 않는 방법 (노트북에서 ssh 로)
`run.sh`·`preflight.sh` 는 stdin 으로 흘려 보낸다. 아래 `S` 는 `quadrature@14.7.12.4`, 브랜치는 푸시된 것이어야 한다.
```bash
# 1) 사전 점검 (읽기 전용) — 출력을 붙여 넣는다
ssh S 'bash -s' < spikes/host-remeasure/preflight.sh
# 2) 준비: 이미지 빌드(코드가 이미지로 들어감) + 결과 볼륨
ssh S 'BRANCH=docs/adr-spec-readme bash -s prepare' < spikes/host-remeasure/run.sh
# 3) 짧은 것부터 차례로, 각각 출력을 확인
for s in g4 g10 g7 g5 g10b g11; do ssh S "bash -s $s" < spikes/host-remeasure/run.sh; done
# 4) 긴 것은 백그라운드로 (SSH 가 끊겨도 산다). 진행은 docker logs -f pf-g2-soak
ssh S 'DETACH=1 bash -s g2-storm' < spikes/host-remeasure/run.sh
# 5) 프로필 + 결과 가져오기 (서버 디스크에 안 남는다)
ssh S 'bash -s profile' < spikes/host-remeasure/run.sh
ssh S 'bash -s pack'    < spikes/host-remeasure/run.sh > host-results.tgz
# 6) 정리 (이미지·볼륨·테스트 컨테이너 제거)
ssh S 'bash -s clean'   < spikes/host-remeasure/run.sh
```
서버 콘솔에서 직접 칠 때는 `run.sh` 를 한 번 붙여 넣어 쓰거나(파일 하나) 위 명령의 `ssh S '…' <` 부분을 `bash -s <단계> <` 로 바꾼다.

## 한계 (시작 전에 적는다)
- 호스트는 공유 서버라 다른 서비스의 부하가 섞인다. 합격 판정은 ‘이 부하 조건에서’ 이다.
- 같은 호스트에서 서버와 부하 생성기가 돌아(loopback) 네트워크·TLS·Funnel·nginx 는 빠져 있다.
- 실행기가 root 로 호스트 도커 소켓을 쓴다. 개발 PC 결과와 **교차 비교하지 않는다**(서로 다른 장비 — 개발 PC 두 대 규칙과 같다). 호스트 합격/불합격만 말한다.
- 이미지(`oven/bun:1.4.4`·`postgres:18`·`nginx:*`·`alpine`)를 새로 받으므로 첫 실행은 네트워크 시간이 든다.
- 첫 서버 시도에서 `DOCKER_BUILDKIT=1` 강제가 buildx 없는 서버(Docker 29.1.3)에서 실패했다. 이후 클래식 빌더 + 빌드 안 `git clone` 으로 바꿨고, 이 PC 에서는 로컬 Docker 로 같은 경로를 확인했다.
