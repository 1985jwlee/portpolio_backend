# S0-8 컨테이너 격리 시험 — rootless Docker (2026-11-13, 호스트)

ADR-050 증거 규칙. 설계: [design/10 §5](../../docs/design/10-security.md) ‘집 PC 침해 피해 범위 한정’, 계획: [design/11 S0-8](../../docs/design/11-implementation-plan.md). 결정: [ADR-054](../../docs/adr/ADR-054-container-isolation-rootless.md).

## 환경
| 항목 | 값 |
|---|---|
| 장비 | 집 서버 qdServer: Xeon Bronze 3204 6코어, Ubuntu 24.04.5 LTS, 공유(Jenkins·Gitea·MySQL 등), 부하 0.4~0.6 |
| 기존 데몬 | root Docker. 패키지 `docker.io` 29.1.3(Ubuntu), Docker 공식 apt 저장소 없음 |
| rootless | 공식 정적 바이너리 `docker-29.1.3.tgz`·`docker-rootless-extras-29.1.3.tgz`(download.docker.com, 체크섬 비교 없음 — TLS 만 신뢰) 를 홈 폴더(`~/pf-rootless/bin`)에 풀어 `dockerd-rootless-setuptool.sh install --force`. `--force` 는 root 데몬이 떠 있을 때 쓴다 |
| 사전 | `uidmap` 설치(sudo, apt), `loginctl enable-linger`, `/etc/subuid`·`subgid`(100000:65536) 기존 |
| 이미지 | `oven/bun:1.4.4`, `nginx:1.30`, `postgres:18`(메이저 태그, 마이너는 미고정) |
| 시험 후 | 설치 전부 제거(`uninstall -f`, `~/pf-rootless`·`~/.local/share/docker` 삭제). AppArmor 프로필 파일(`/etc/apparmor.d/home.quadrature.pf-rootless.bin.rootlesskit`)은 sudo 로 만든 것이라 남아 있다 |
| 스크립트 | `hardening-1.sh`(Bun·nginx·Postgres), `hardening-2.sh`(nginx 비root, 포트, uid) — 서버에 파일을 두지 않고 ssh 표준 입력으로 실행 |

## 결과 (표준 출력 요약, 각 1회)
| 시험 | 결과 |
|---|---|
| **데몬 기동** | 처음에 `rootlesskit` 가 `fork/exec /proc/self/exe: permission denied` 로 실패. `kernel.apparmor_restrict_unprivileged_userns=1`(Ubuntu 24.04 기본) 때문이다. `rootlesskit` 바이너리 하나에 `userns` 를 허용하는 AppArmor 프로필을 sudo 로 둔 뒤 기동 성공(`SecurityOptions: seccomp, rootless, cgroupns`) |
| Bun 1.4.4: `cap_drop ALL` + `no-new-privileges` + `read_only` + `tmpfs /tmp` | **기동·HTTP 200** (기본 root 사용자와 `--user 1000:1000` 모두) |
| nginx 1.30: `cap_drop ALL` 만 | **실패** — `chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)` |
| nginx 1.30: `cap_drop ALL` + `CHOWN`·`SETUID`·`SETGID`·`DAC_OVERRIDE`·`NET_BIND_SERVICE` | **기동·HTTP 200** |
| nginx 1.30: `cap_drop ALL` + `--user 101`, 포트 8080, pid·임시 경로를 `/tmp` | **기동·HTTP 200** (cap 추가 없음) |
| Postgres 18: `cap_drop ALL` 만 | **실패** — `mkdir: cannot create directory ‘/var/lib/postgresql/18’: Permission denied` |
| Postgres 18: `cap_drop ALL` + `CHOWN`·`SETUID`·`SETGID`·`DAC_OVERRIDE`·`FOWNER` + `tmpfs /var/run/postgresql` + 데이터 볼륨 | **기동·`accepting connections`** |
| 호스트 포트 1024 미만(`-p 127.0.0.1:80:80`) | **시작 실패**(컨테이너가 `Created` 에 머묾) — 정확한 오류 문구는 저장하지 못했다 |
| 높은 포트(`-p 127.0.0.1:38082:80`) → 호스트에서 접속 | HTTP 200 |

## 못 한 것·한계
- 각 시험 1회이고 기동 확인까지다. 성능·안정성(장시간)·재시작은 보지 않았다.
- `read_only` 시 쓰기 경로는 시험한 이미지·설정에 한한다. 실제 앱(Next·api·ws-gateway)·compose 서비스 전체는 시험하지 않았다.
- **사설 대역 송신 차단**(design/10 의 ‘호스트 방화벽’ 층)은 확인하지 못했다. `192.168.0.1` 로의 `wget` 이 시간 초과(rc=143)였으나 그 주소에 기기가 있는지 몰라 판정할 수 없다.
- 컨테이너 uid ↔ 호스트 uid 매핑 출력은 저장하지 못했다.
- 같은 서버의 root 데몬과 동시에 돌렸다. pf 전용 데몬으로 계속 두는 구성(`systemctl --user`, linger)은 기동만 확인했고 재부팅 후 유지는 시험하지 않았다.
- 호스트 무결성 점검 전의 서버다.
