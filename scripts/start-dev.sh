#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set any local development values first." >&2
  exit 1
fi

docker compose up -d --wait db
docker compose exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh
docker compose up --build -d
echo "Development stack started: frontend http://localhost:5173, API http://localhost:8080, Mailpit http://localhost:8025, pgAdmin http://127.0.0.1:5050"
echo "Existing database data was preserved. To add demo data manually, paste database/seeds/development-demo.sql into pgAdmin Query Tool."
# Every class needs grade weights; give any class offering without them a starting configuration.
docker compose exec -T web php /var/www/html/backend/bin/bootstrap-grade-weights.php \
  || echo "Warning: grade-weight bootstrap did not finish. Run: docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php" >&2
# REG-010: with no Dean account yet, invite the first Dean named in .env (FIRST_DEAN_*).
docker compose exec -T web php /var/www/html/backend/bin/bootstrap-first-dean.php \
  || echo "Warning: first Dean invitation did not finish. Check FIRST_DEAN_* in .env, then run: docker compose exec web php /var/www/html/backend/bin/bootstrap-first-dean.php" >&2
# BIO-005: delete biometric references whose semester ended or whose Student is no longer active.
docker compose exec -T web php /var/www/html/backend/bin/expire-biometrics.php \
  || echo "Warning: biometric expiry sweep did not finish. Run: docker compose exec web php /var/www/html/backend/bin/expire-biometrics.php" >&2
