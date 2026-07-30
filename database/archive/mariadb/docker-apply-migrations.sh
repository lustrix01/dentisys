#!/bin/sh
set -eu

db_name="${MARIADB_DATABASE:-dentisys}"
client="mariadb --protocol=socket -uroot -p${MARIADB_ROOT_PASSWORD} ${db_name}"

for migration in /migrations/[0-9][0-9][0-9]_*.sql; do
    version="$(basename "$migration")"
    applied="$($client --batch --skip-column-names -e "SELECT COUNT(*) FROM _schema_migrations WHERE version='${version}'")"
    if [ "$applied" = "0" ]; then
        $client < "$migration"
        $client -e "INSERT INTO _schema_migrations (version) VALUES ('${version}')"
    fi
done
