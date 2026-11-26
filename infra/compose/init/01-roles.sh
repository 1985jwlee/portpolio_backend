# compose postgres 최초 기동(빈 데이터 볼륨)에 한 번 도는 init — packages/db/roles.json 의 관리 역할과 pf_migrator 를 만든다(TD-8 8-8).
# 이 파일은 postgres 이미지의 entrypoint 가 읽어 들인다(source) — 그래서 셸 옵션을 바꾸지 않도록 서브셸 안에서 돌고, 실패하면 exit 1 로 init 을 실패시킨다.
# 비밀번호는 환경변수 PF_DEV_DB_PASSWORD 에서만 받고 이 파일에 리터럴로 쓰지 않는다. psql 변수(:'pw')로 넘겨 SQL 문자열에 이어 붙이지 않는다.
# 표 권한은 여기서 주지 않는다 — `bun run db:migrate` 가 roles.json 으로 적용한다.
(
	set -eu

	# 시험이 다른 파일을 가리킬 수 있게 덮어쓰기를 둔다(scripts/compose-init.test.ts).
	roles_file=${PF_ROLES_FILE:-/docker-entrypoint-initdb.d/roles.json}

	if [ -z "${PF_DEV_DB_PASSWORD:-}" ]; then
		echo "01-roles.sh: PF_DEV_DB_PASSWORD 가 없다" >&2
		exit 1
	fi

	# roles.json 의 "roles" 배열만 꺼낸다 — 개행·공백을 지운 뒤 [ ] 사이를 잘라 쉼표로 가른다(jq 가 이미지에 없다).
	names=$(tr -d '\n\r\t ' < "$roles_file" | sed -n 's/.*"roles":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' ' ')
	if [ -z "$names" ]; then
		echo "01-roles.sh: roles.json 에서 roles 를 읽지 못했다" >&2
		exit 1
	fi

	# 역할 이름은 SQL 식별자로 인용되므로 roles.json 과 같은 규칙(roles-spec.ts)으로 검증한다.
	for name in $names pf_migrator; do
		case "$name" in
			''|[!a-z_]*|*[!a-z0-9_]*)
				echo "01-roles.sh: 역할 이름이 규칙(^[a-z_][a-z0-9_]*\$)에 맞지 않는다: $name" >&2
				exit 1
				;;
		esac
	done

	psql_run() {
		psql -v ON_ERROR_STOP=1 -v pw="$PF_DEV_DB_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
	}

	for name in $names pf_migrator; do
		psql_run <<SQL
create role "$name" login password :'pw';
SQL
	done

	# pf_migrator 는 모듈 스키마와 pf_migrations 를 만들 수 있어야 한다. 나머지 역할은 LOGIN 만 갖는다.
	psql_run <<SQL
grant create on database "$POSTGRES_DB" to pf_migrator;
SQL

	echo "01-roles.sh: 역할 생성 완료($names pf_migrator)"
) || exit 1
