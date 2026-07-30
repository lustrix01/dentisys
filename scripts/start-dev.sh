#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set any local development values first." >&2
  exit 1
fi

docker compose up --build -d
docker compose exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh
echo "Development stack started: frontend http://localhost:5173, API http://localhost:8080, Mailpit http://localhost:8025, pgAdmin http://127.0.0.1:5050"
echo "Existing database data was preserved. To add demo data manually, paste database/seeds/development-demo.sql into pgAdmin Query Tool."
