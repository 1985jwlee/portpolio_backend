#!/usr/bin/env bash
# PC 에서 실행: 이 커밋의 소스를 git archive 로 ssh 에 흘려 서버 이미지(pf-spike)를 만든다. 푸시 불필요, 서버는 원격 저장소에 접속하지 않고 파일도 안 남는다.
# 사용: spikes/host-remeasure/prepare-push.sh quadrature@14.7.12.4
# 작성: AI 초안 (Authorship: G).
set -euo pipefail
S="${1:?ssh 대상(예: quadrature@14.7.12.4)}"
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "추적 파일에 커밋 안 된 변경이 있다 — 커밋하거나 되돌린 뒤 실행(archive 는 HEAD 만 담는다)"; exit 1; }
commit=$(git rev-parse HEAD)
script=$(tr -d '\r' < spikes/host-remeasure/run.sh)   # run.sh 는 인자로 넘긴다(stdin 은 tar 가 쓴다)
echo "측정 대상 커밋: $commit"
git archive HEAD | ssh "$S" "COMMIT=$commit bash -c $(printf %q "$script") run.sh prepare"
