#!/usr/bin/env bash
# 호스트 재측정 실행기. 서버에 소스를 설치하지 않는다: $WORK(기본 /tmp/pf-host-remeasure)에 저장소를 받아
# 실행기 컨테이너(Bun+docker CLI)로 각 스파이크를 돌리고, 끝나면 pack 으로 결과만 묶는다. 작성: AI 초안 (Authorship: G).
# 사용: REPO=<url> BRANCH=<브랜치> ./run.sh <단계>
#   단계: prepare | g4 | g5 | g7 | g10 | g10b | g11 | g2-storm | g2-churn | g2-soak | pack | clean
set -euo pipefail
REPO="${REPO:-https://github.com/1985jwlee/portpolio_backend.git}"
BRANCH="${BRANCH:-docs/adr-spec-readme}"
WORK="${WORK:-/tmp/pf-host-remeasure}"
RUNNER="${RUNNER:-pf-spike-runner}"
step="${1:?단계를 지정하라}"

dr() { # 실행기 안에서 명령을 돌린다. WORK 를 같은 경로로 마운트해야 스파이크가 부르는 docker -v 경로가 호스트 경로와 같다.
  local dir="$1"; shift
  docker run --rm --network host --ulimit nofile=65536:65536 \
    -v "$WORK:$WORK" -v /var/run/docker.sock:/var/run/docker.sock \
    -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" -w "$WORK/repo/spikes/$dir" "$RUNNER" \
    sh -c "$* ; rc=\$?; chown -R \$HOST_UID:\$HOST_GID $WORK 2>/dev/null; exit \$rc"
}
load_check() { local l; l=$(cut -d' ' -f1 /proc/loadavg); echo "loadavg(1m)=$l"; awk -v l="$l" 'BEGIN{exit !(l>3)}' && { [ "${FORCE:-0}" = 1 ] || { echo "호스트 부하가 3 초과라 중단한다(FORCE=1 로 무시 가능)"; exit 3; }; } || true; }

case "$step" in
  prepare)
    mkdir -p "$WORK"
    if [ ! -d "$WORK/repo/.git" ]; then
      docker run --rm -v "$WORK:/w" alpine/git clone --depth 1 --branch "$BRANCH" "$REPO" /w/repo
    fi
    docker build -q -t "$RUNNER" -f "$WORK/repo/spikes/host-remeasure/Dockerfile.runner" "$WORK/repo/spikes/host-remeasure"
    touch "$WORK/.start"
    docker run --rm -v "$WORK:/w" alpine/git -c safe.directory='*' -C /w/repo rev-parse HEAD | tee "$WORK/commit.txt"
    echo "준비 완료: $WORK" ;;
  g4)   load_check; dr g4-g10-db "bun install --frozen-lockfile && bun g4.ts" ;;
  g10)  load_check; dr g4-g10-db "bun install --frozen-lockfile && bun g10.ts" ;;
  g5)   load_check; dr g5-metrics "bun install --frozen-lockfile && bun verify.ts" ;;
  g7)   load_check; dr g7-nginx-realip "bun verify.ts" ;;
  g10b) load_check; dr g10b-module-migrations "bun install --frozen-lockfile && bun g10b.ts" ;;
  g11)  load_check; dr g11-module-extraction "bun install --frozen-lockfile && bun g11.ts" ;;
  g2-storm) load_check; dr g2-ws-soak "WARMUP_MIN=0.5 bun run.ts --duration=300 --slow=0 --storm=1 --stormAt=60,150 --window=5 --label=storm" ;;
  g2-churn) load_check; dr g2-ws-soak "bun run.ts --duration=1500 --public=180 --private=20 --slow=0 --churnRate=50 --churnAt=120 --churnSec=1200 --window=60 --label=churn" ;;
  g2-soak)  load_check; dr g2-ws-soak "bun run.ts --duration=4920 --slow=10 --slowAt=1800 --label=soak82m" ;;
  pack)
    cd "$WORK/repo"
    { date -u +%FT%TZ; cat "$WORK/commit.txt"; hostname; uname -r; lscpu | grep -E 'Model name|^CPU\(s\)'; docker version --format 'docker {{.Server.Version}}'; } > "$WORK/host-profile.txt"
    find spikes -path '*/results/*' -type f -newer "$WORK/.start" > "$WORK/files.txt"
    tar czf "$WORK/host-results.tgz" -C "$WORK/repo" -T "$WORK/files.txt" -C "$WORK" host-profile.txt
    ls -la "$WORK/host-results.tgz"; wc -l < "$WORK/files.txt" ;;
  clean)
    docker rm -f g4-pg g10-pg g10b-pg g7-upstream g7-nginx-t g7-nginx-u >/dev/null 2>&1 || true
    docker network rm g7net >/dev/null 2>&1 || true
    rm -rf "$WORK"; echo "정리 완료(실행기 이미지 $RUNNER 는 남아 있다: docker rmi $RUNNER)" ;;
  *) echo "알 수 없는 단계: $step"; exit 2 ;;
esac
