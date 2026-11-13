#!/usr/bin/env bash
# S0-8: rootless Docker 에서 compose 기본 강화(cap_drop ALL, no-new-privileges, read_only)가 기동하는지.
export PATH=$HOME/pf-rootless/bin:$PATH XDG_RUNTIME_DIR=/run/user/$(id -u)
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
H="--security-opt no-new-privileges:true --read-only"
rm_all(){ docker rm -f s08-bun s08-ng s08-pg >/dev/null 2>&1; docker volume rm s08-pgdata >/dev/null 2>&1; }
rm_all
echo "== pull"; for i in oven/bun:1.4.4 nginx:1.30 postgres:18; do docker pull -q $i 2>&1 | tail -1; done
echo "== bun: cap_drop ALL + read_only + tmpfs /tmp, 기본 사용자"
docker run -d --name s08-bun $H --cap-drop ALL --tmpfs /tmp -p 127.0.0.1:38081:3000 oven/bun:1.4.4 bun -e 'Bun.serve({port:3000,fetch:()=>new Response("ok")}); console.log("up")' >/dev/null; sleep 3
docker logs s08-bun 2>&1 | tail -2; docker exec s08-bun bun -e 'const r=await fetch("http://127.0.0.1:3000");console.log("bun http",r.status,await r.text())' 2>&1 | tail -1
echo "-- bun: --user 1000 (비root)"
docker rm -f s08-bun >/dev/null; docker run -d --name s08-bun $H --cap-drop ALL --user 1000:1000 --tmpfs /tmp oven/bun:1.4.4 bun -e 'Bun.serve({port:3000,fetch:()=>new Response("ok")}); console.log("up")' >/dev/null; sleep 3
docker exec s08-bun bun -e 'const r=await fetch("http://127.0.0.1:3000");console.log("bun nonroot http",r.status)' 2>&1 | tail -1
echo "== nginx A: cap_drop ALL 만 (read_only+tmpfs)"
NGT="--tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp"
docker run -d --name s08-ng $H --cap-drop ALL $NGT nginx:1.30 >/dev/null; sleep 3
docker ps -a --filter name=s08-ng --format "{{.Status}}"; docker logs s08-ng 2>&1 | tail -3
echo "== nginx B: ALL + CHOWN SETUID SETGID DAC_OVERRIDE NET_BIND_SERVICE"
docker rm -f s08-ng >/dev/null; docker run -d --name s08-ng $H --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE --cap-add NET_BIND_SERVICE $NGT nginx:1.30 >/dev/null; sleep 3
docker ps -a --filter name=s08-ng --format "{{.Status}}"; docker exec s08-ng sh -c 'curl -s -o /dev/null -w "nginx http=%{http_code}\n" http://127.0.0.1/ 2>&1 || (command -v wget && wget -qO- http://127.0.0.1/ | head -c 40)' 2>&1 | tail -1
echo "== nginx C: nginxinc/nginx-unprivileged 대신 --user 101 + 8080"
docker rm -f s08-ng >/dev/null; docker run -d --name s08-ng $H --cap-drop ALL --user 101:101 $NGT nginx:1.30 sh -c "sed -i 's/listen       80;/listen 8080;/; s/listen  *\[::\]:80;//' /etc/nginx/conf.d/default.conf 2>/dev/null; nginx -g 'daemon off; pid /tmp/nginx.pid;'" >/dev/null; sleep 3
docker ps -a --filter name=s08-ng --format "{{.Status}}"; docker logs s08-ng 2>&1 | tail -2
echo "== postgres A: cap_drop ALL 만"
docker volume create s08-pgdata >/dev/null
PGT="--tmpfs /var/run/postgresql --tmpfs /tmp -v s08-pgdata:/var/lib/postgresql -e POSTGRES_PASSWORD=x"
docker run -d --name s08-pg $H --cap-drop ALL $PGT postgres:18 >/dev/null; sleep 10
docker ps -a --filter name=s08-pg --format "{{.Status}}"; docker logs s08-pg 2>&1 | tail -3
echo "== postgres B: ALL + CHOWN SETUID SETGID DAC_OVERRIDE FOWNER"
docker rm -f s08-pg >/dev/null; docker volume rm s08-pgdata >/dev/null; docker volume create s08-pgdata >/dev/null
docker run -d --name s08-pg $H --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE --cap-add FOWNER $PGT postgres:18 >/dev/null; sleep 15
docker ps -a --filter name=s08-pg --format "{{.Status}}"; docker exec s08-pg pg_isready -U postgres 2>&1 | tail -1; docker logs s08-pg 2>&1 | tail -2
rm_all; echo "== 이미지 정리 전 크기"; docker system df 2>&1 | head -3
