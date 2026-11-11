#!/usr/bin/env bash
# 호스트 재측정 사전 점검 — 읽기 전용이다(아무것도 바꾸거나 띄우지 않는다). 출력을 그대로 붙여 넣어 달라.
# 작성: AI 초안 (Authorship: G).
set -u
echo "== 시각/호스트"; date -u +%FT%TZ; hostname; uname -r
echo "== CPU/메모리/부하"; lscpu | grep -E 'Model name|^CPU\(s\)|MHz|Flags' | sed -E 's/Flags:.*(avx2).*/Flags: ...avx2.../' | cut -c1-120; free -h | head -2; cat /proc/loadavg
echo "== 디스크"; df -h /tmp / | cat
echo "== Docker"; docker version --format 'server {{.Server.Version}} client {{.Client.Version}}' 2>&1; docker info --format 'driver={{.Driver}} root={{.DockerRootDir}} cgroup={{.CgroupVersion}} rootless={{.SecurityOptions}}' 2>&1 | cut -c1-200
echo "== 필요한 포트가 이미 쓰이는가 (비어 있어야 한다)"
for p in 35433 35434 35435 38080 38081 39500; do if ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN; then echo "사용 중: $p"; else echo "비어 있음: $p"; fi; done
echo "== 이름이 겹치는 컨테이너/네트워크 (없어야 한다)"
docker ps -a --format '{{.Names}}' | grep -E '^(g4-pg|g10-pg|g10b-pg|g7-|g14-)' || echo "컨테이너 겹침 없음"
docker network ls --format '{{.Name}}' | grep -E '^g7net$' || echo "네트워크 g7net 겹침 없음"
echo "== G7 이 쓸 서브넷 172.28.0.0/16 과 겹치는 기존 네트워크 (없어야 한다)"
docker network ls -q | xargs -r docker network inspect --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' | grep -E ' 172\.(2[89]|[0-9]{1,2})\.|172\.28' || echo "겹침 없음"
echo "== 이미 받아 둔 이미지"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^(oven/bun|postgres|nginx|docker|alpine/git)' | sort || true
echo "== 지금 돌고 있는 컨테이너 수"; docker ps -q | wc -l
echo "== ulimit"; ulimit -n
