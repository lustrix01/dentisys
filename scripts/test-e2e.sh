#!/usr/bin/env bash
# macOS/Linux twin of scripts/test-e2e.ps1: start Vite on 127.0.0.1:15174, run Playwright, stop Vite.
# Usage: bash scripts/test-e2e.sh [playwright args...]   e.g. bash scripts/test-e2e.sh e2e/auth.spec.ts
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

frontend_vite="$root/frontend/node_modules/vite/bin/vite.js"
if [ ! -f "$frontend_vite" ]; then
  echo 'Frontend dependencies are missing; installing from frontend/package-lock.json.'
  npm --prefix frontend ci --no-audit --no-fund
fi

playwright_cli="$root/node_modules/@playwright/test/cli.js"
if [ ! -f "$playwright_cli" ]; then
  echo 'Root Playwright dependencies are missing; run npm ci before npm run test:e2e.' >&2
  exit 1
fi

(cd "$root/frontend" && exec node "$frontend_vite" --host 127.0.0.1 --port 15174 --strictPort) >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT

ready=false
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:15174/; then ready=true; break; fi
  if ! kill -0 "$server" 2>/dev/null; then echo 'Vite development server exited before becoming ready.' >&2; exit 1; fi
  sleep 0.25
done
if [ "$ready" != true ]; then echo 'Timed out waiting for the Vite development server.' >&2; exit 1; fi

set +e
node "$playwright_cli" test "$@"
exit_code=$?
set -e
exit "$exit_code"
