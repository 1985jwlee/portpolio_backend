# ADR-054: 컨테이너 격리는 rootless Docker 를 기본으로 한다 (S0-8)
- 상태: **Accepted** (2026-11-13) — 사용자 수락. 결정 4개 항목과 ‘근거와 한계’ 의 미시험 항목(사설 대역 송신 차단, 재부팅 후 유지, 실제 compose)을 함께 수용했다
- 날짜: 2026-11-13
- 근거: design/10 §5 ‘집 PC 침해 피해 범위 한정’(데몬 층) · design/11 S0-8 · ADR-033(공유 호스트) · ADR-050(증거 규칙)
- 증거: [`spikes/s0-8-rootless/ENV.md`](../../spikes/s0-8-rootless/ENV.md) — 스크립트·결과·환경. 호스트 1회 시험.
- 관련 문서: [design/10-security.md](../design/10-security.md) §5 · [design/11](../design/11-implementation-plan.md) S0-8

## 맥락
design/10 은 컨테이너 루트가 호스트 루트로 이어지지 않게 하려고 `rootless Docker` 또는 `userns-remap` 중 하나를 S0-8 에서 정하라고 했고 기본값 제안은 rootless 였다. 호스트는 Ubuntu 의 `docker.io` 29.1.3 root 데몬을 쓰고 Jenkins·Gitea·MySQL 등이 같이 돈다.

## 결정
1. **pf 서비스는 rootless Docker(전용 사용자 데몬)에서 돌린다.** 호스트 root 데몬과 분리하고 기존 서비스는 건드리지 않는다. `userns-remap` 은 데몬 설정을 바꿔 공유 서버의 모든 컨테이너에 영향을 주므로 채택하지 않는다.
2. **compose 기본 강화**(`cap_drop: [ALL]`, `no-new-privileges`, `read_only`)는 서비스별로 아래 예외를 둔다(실측, 한 번).

| 이미지 | `cap_drop: [ALL]` 만 | 예외(추가해야 기동) |
|---|---|---|
| Bun(`oven/bun:1.4.4`) | 기동 | 없음. `tmpfs /tmp` 만 필요 |
| nginx 1.30 | **실패**(`chown` 불가) | ①`cap_add: CHOWN, SETUID, SETGID, DAC_OVERRIDE, NET_BIND_SERVICE` 또는 ②`user: 101`+8080 포트+pid·임시 경로를 `/tmp` 로 하면 cap 추가 없이 기동 |
| Postgres 18 | **실패**(`/var/lib/postgresql/18` 생성 불가) | `cap_add: CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER` + `tmpfs /var/run/postgresql` + 데이터 볼륨 |

3. **호스트 설정 선행 조건 세 가지**: ① `uidmap` 패키지, ② `loginctl enable-linger`, ③ **Ubuntu 24.04 는 `kernel.apparmor_restrict_unprivileged_userns=1` 이라 `rootlesskit` 에 대한 AppArmor 프로필(`userns,`)이 필요하다(sudo 1회)**. sysctl 전체를 끄는 것은 서버 전체의 제한을 낮추므로 권하지 않는다.
4. **포트 제약**: rootless 는 호스트의 1024 미만 포트를 게시하지 못했다(`-p 127.0.0.1:80:80` 시작 실패). 공개 진입(80/443)은 기존 경로(Tailscale Funnel → 높은 포트의 nginx)로 이미 높은 포트이므로 영향이 작지만, **호스트 80/443 을 직접 쓰는 구성은 별도 조치가 필요하다**.

## 근거와 한계
- 위 결과는 호스트 1회·기동 확인까지이고, 실제 앱·compose 전체·장시간·재부팅 후 유지는 시험하지 않았다.
- 사설 대역 송신 차단은 확인하지 못했다(design/10 호스트 방화벽 층은 이 결정으로 달성되지 않는다).
- 설치는 Docker 공식 정적 바이너리이며 체크섬을 따로 대조하지 않았다(TLS 만 신뢰). 상시 운영 때는 버전·체크섬 고정이 필요하다.
- 시험 설치는 모두 제거했다(AppArmor 프로필 파일만 남음). 호스트 무결성 점검 전의 서버다.

## 되돌리는 조건
rootless 에서 pf 서비스가 필요한 기능(예: 낮은 포트, 특정 네트워크 모드, 성능)을 못 낼 때, 또는 AppArmor 프로필 운영이 부담일 때 `userns-remap` 을 전용 호스트가 생길 때 다시 본다.
