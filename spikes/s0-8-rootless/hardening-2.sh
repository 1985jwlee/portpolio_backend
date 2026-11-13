export PATH=$HOME/pf-rootless/bin:$PATH XDG_RUNTIME_DIR=/run/user/$(id -u)
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
H="--security-opt no-new-privileges:true --read-only"
docker rm -f s08-ng s08-p80 >/dev/null 2>&1
echo "== nginx C: --user 101, 8080, pid /tmp (cap 없음)"
docker run -d --name s08-ng $H --cap-drop ALL --user 101:101 --tmpfs /tmp --tmpfs /var/cache/nginx nginx:1.30 sh -c 'printf "pid /tmp/nginx.pid;\nevents{}\nhttp{ access_log off; client_body_temp_path /tmp/c; proxy_temp_path /tmp/p; fastcgi_temp_path /tmp/f; uwsgi_temp_path /tmp/u; scgi_temp_path /tmp/s;\n server{ listen 8080; location / { return 200 ok; } } }\n" > /tmp/n.conf && exec nginx -g "daemon off;" -c /tmp/n.conf' >/dev/null; sleep 3
docker ps -a --filter name=s08-ng --format "{{.Status}}"; docker exec s08-ng sh -c 'curl -s -w " http=%{http_code}\n" http://127.0.0.1:8080/' 2>&1 | tail -1
docker rm -f s08-ng >/dev/null
echo "== 호스트 포트: 1024 미만(80) 게시"
docker run -d --name s08-p80 -p 127.0.0.1:80:80 nginx:1.30 2>&1 | tail -2; docker ps -a --filter name=s08-p80 --format "{{.Status}}"
docker rm -f s08-p80 >/dev/null 2>&1
echo "== 호스트 포트: 높은 포트(38082) 게시 + 로컬 접속"
docker run -d --name s08-p80 -p 127.0.0.1:38082:80 nginx:1.30 >/dev/null; sleep 2; curl -s -o /dev/null -w "host 127.0.0.1:38082 http=%{http_code}\n" http://127.0.0.1:38082/; docker rm -f s08-p80 >/dev/null
echo "== 컨테이너 uid -> 호스트 uid"; docker run --rm --name s08-id alpine sh -c 'id -u; cat /proc/self/uid_map' 2>&1 | head -3
echo "== 외부(RFC1918) 송신 가능?"; docker run --rm alpine sh -c 'timeout 3 wget -qO- http://192.168.0.1 >/dev/null 2>&1; echo "wget rc=$?"' 2>&1 | tail -1
