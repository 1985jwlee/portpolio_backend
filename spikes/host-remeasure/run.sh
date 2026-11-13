#!/usr/bin/env bash
# 호스트 재측정 실행기 — 서버에 코드를 받지 않는다. 코드는 이미지(pf-spike) 안에만 있고 결과는 도커 볼륨(pf-results)에 모인다.
# 사용: BRANCH=<브랜치> ./run.sh <단계>     (이 스크립트 한 파일만 서버에 있으면 된다. 파일 없이 쓰려면 README 의 ‘한 파일도 두지 않는 방법’)
#   단계: prepare | g4 | g5 | g7 | g10 | g10b | g11 | g3-browser | g3-sigterm | g2-storm | g2-churn | g2-soak | profile | pack | clean
# 작성: AI 초안 (Authorship: G).
set -euo pipefail
IMAGE="${IMAGE:-pf-spike}"
VOL="${VOL:-pf-results}"
step="${1:?단계를 지정하라}"

dr() { # dr <스파이크 폴더> <명령>: 이미지 안에서 돌리고, 이번에 새로 생긴 results 파일만 볼륨에 복사한다.
  local dir="$1"; shift
  local mode=(--rm); [ "${DETACH:-0}" = 1 ] && mode=(-d --name "pf-$step")   # DETACH=1: 백그라운드(SSH 가 끊겨도 산다). docker logs -f pf-<단계> 로 본다
  docker run "${mode[@]}" --network host --ulimit nofile=65536:65536 \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$VOL:/out" -w "/repo/spikes/$dir" "$IMAGE" \
    sh -c "$* ; rc=\$?; if [ -d results ]; then mkdir -p /out/$dir; (cd results && find . -type f -newer /repo/.built -print0 | xargs -0 -r cp --parents -t /out/$dir); fi; exit \$rc"
}
load_check() { local l; l=$(cut -d' ' -f1 /proc/loadavg); echo "loadavg(1m)=$l"; awk -v l="$l" 'BEGIN{exit !(l>3)}' && { [ "${FORCE:-0}" = 1 ] || { echo "호스트 부하가 3 초과라 중단한다(FORCE=1 로 무시 가능)"; exit 3; }; } || true; }

case "$step" in
  prepare)
    # 소스는 표준 입력의 tar 로 받는다(PC: prepare-push.sh = git archive HEAD | ssh). 서버는 원격 저장소에 접속하지 않는다.
    [ -t 0 ] && { echo "표준 입력으로 git archive tar 가 필요하다: spikes/host-remeasure/prepare-push.sh 를 쓴다"; exit 2; }
    : "${COMMIT:?COMMIT(커밋 해시)가 필요하다 - prepare-push.sh 가 넣는다}"
    docker volume create "$VOL" >/dev/null
    # docker build 를 쓰지 않는다: buildx 없는 서버(Docker 29.1.3)에서 실패했다. 컨테이너를 띄워 도구를 넣고 소스를 복사한 뒤 docker commit 으로 이미지를 만든다.
    docker rm -f pf-prep pf-dockercli >/dev/null 2>&1 || true
    docker run -d --name pf-prep oven/bun:1.4.4 sleep infinity >/dev/null
    docker create --name pf-dockercli docker:cli >/dev/null
    docker cp pf-dockercli:/usr/local/bin/docker - | docker cp - pf-prep:/usr/local/bin/
    docker rm -f pf-dockercli >/dev/null
    docker exec pf-prep sh -c "apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates procps util-linux >/dev/null && rm -rf /var/lib/apt/lists/* && mkdir /repo"
    docker cp - pf-prep:/repo   # stdin = git archive tar (.git 없음)
    # 풀린 파일의 시각이 .built 보다 새로 찍혀 예전 results 가 ‘이번 결과’로 복사됐다(첫 서버 실행에서 발견) — 모두 과거로 돌린 뒤 .built 를 찍는다.
    # 스파이크가 결과에 남기는 git rev-parse HEAD / git status 용 얇은 git 대역: 커밋은 archive 를 만든 커밋(COMMIT), archive 는 HEAD 그대로라 변경 없음.
    docker exec pf-prep sh -c "echo '$COMMIT' > /repo/.commit && find /repo -type f -exec touch -d 2000-01-01 {} + && touch /repo/.built"
    docker exec -i pf-prep sh -c 'cat > /usr/local/bin/git && chmod +x /usr/local/bin/git' <<'GITSHIM'
#!/bin/sh
while [ "$1" = -C ]; do shift 2; done
case "$1" in rev-parse) cat /repo/.commit ;; status) : ;; *) exit 1 ;; esac
GITSHIM
    docker commit --change 'WORKDIR /repo' --change 'CMD ["sh"]' pf-prep "$IMAGE" >/dev/null
    docker rm -f pf-prep >/dev/null
    docker run --rm "$IMAGE" git -C /repo rev-parse HEAD
    echo "준비 완료: 이미지 $IMAGE, 결과 볼륨 $VOL (서버 파일 시스템에 코드 없음, 서버는 원격 저장소에 접속하지 않음)" ;;
  g4)   load_check; dr g4-g10-db "bun install --frozen-lockfile && bun g4.ts" ;;
  g10)  load_check; dr g4-g10-db "bun install --frozen-lockfile && bun g10.ts" ;;
  g5)   load_check; dr g5-metrics "bun install --frozen-lockfile && bun verify.ts" ;;
  g7)   load_check; dr g7-nginx-realip "bun verify.ts" ;;
  g10b) load_check; dr g10b-module-migrations "bun install --frozen-lockfile && bun g10b.ts" ;;
  g3-browser) load_check; dr g3-next-on-bun "bun install --frozen-lockfile && bunx playwright install --with-deps chromium && bun verify.ts --only=6,7 --skip=10" ;;
  g3-sigterm) load_check; dr g3-next-on-bun "bun install --frozen-lockfile && bun verify.ts --only=12,13 --skip=10" ;;
  g11)  load_check; dr g11-module-extraction "bun install --frozen-lockfile && bun g11.ts" ;;
  g2-storm) load_check; dr g2-ws-soak "WARMUP_MIN=0.5 bun run.ts --duration=300 --slow=0 --storm=1 --stormAt=60,150 --window=5 --label=storm" ;;
  g2-churn) load_check; dr g2-ws-soak "bun run.ts --duration=1500 --public=180 --private=20 --slow=0 --churnRate=50 --churnAt=120 --churnSec=1200 --window=60 --label=churn" ;;
  g2-soak)  load_check; dr g2-ws-soak "bun run.ts --duration=4920 --slow=10 --slowAt=1800 --label=soak82m" ;;
  profile)
    docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$VOL:/out" "$IMAGE" sh -c \
      '{ date -u +%FT%TZ; git -C /repo rev-parse HEAD; hostname; uname -r; lscpu | grep -E "Model name|^CPU\(s\)"; cat /proc/loadavg; docker version --format "docker {{.Server.Version}}"; } > /out/host-profile.txt; cat /out/host-profile.txt' ;;
  pack)   # 표준 출력으로 tar.gz 를 내보낸다: ./run.sh pack > host-results.tgz  (서버 디스크에 안 남기려면 노트북에서 ssh 로 실행)
    docker run --rm -v "$VOL:/out:ro" alpine tar czf - -C /out . ;;
  clean)
    docker rm -f pf-prep pf-dockercli g4-pg g10-pg g10b-pg g7-upstream g7-nginx-t g7-nginx-u pf-g2-storm pf-g2-churn pf-g2-soak >/dev/null 2>&1 || true
    docker network rm g7net >/dev/null 2>&1 || true
    docker volume rm "$VOL" >/dev/null 2>&1 || true
    docker rmi "$IMAGE" >/dev/null 2>&1 || true
    echo "정리 완료: 이미지·볼륨·테스트 컨테이너 제거" ;;
  *) echo "알 수 없는 단계: $step"; exit 2 ;;
esac
