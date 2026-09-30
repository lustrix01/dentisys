# DentiSys

DentiSys is a Docker-first academic and clinical management system for the Bicol University College of Dental Medicine. Its supported runtime today is local development on one device, using React/Vite, a plain PHP API, PostgreSQL, Mailpit, and pgAdmin.

| Runtime | Status | Use it for |
| --- | --- | --- |
| Development workstation | **Supported** | Daily development and local testing on one device |
| Same-host single-server stack | **Unfinished private-LAN prototype** | Controlled implementation testing only |
| Separate application/database servers | **Not implemented** | Future work |

## Development environment: from-scratch guide

The development stack runs entirely on your device as Docker containers. PostgreSQL communicates only on Docker's internal network; it has no published host port.

### 1. Install prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose available.
- Node.js 20.19 or newer (22 LTS recommended; the containers use Node 24) for frontend builds and browser tests. Vite 8 does not run on Node 18.
- Playwright Chromium only when running end-to-end tests.

This repository supports Docker Compose only. Do not use XAMPP, native PHP, native MySQL/MariaDB, or phpMyAdmin.

### 2. Create the development environment file

```powershell
Copy-Item .env.example .env
```

The committed example contains development-safe defaults. Keep `.env` local and do not commit secrets.

### 3. Install test dependencies when needed

For frontend builds or Playwright tests, install the root test dependency and the Chromium browser once:

```powershell
npm ci
npx playwright install chromium
```

`npm run test:e2e` checks for the frontend Vite dependency and installs `frontend/package-lock.json` automatically when `frontend/node_modules` is absent. The root `npm ci` above remains required for Playwright itself.

### 4. Start the complete development system

```powershell
.\scripts\start-dev.ps1
```

On macOS or Linux, run `./scripts/start-dev.sh`. The script applies pending migrations, builds the images, installs frontend packages when `frontend/package-lock.json` changed, starts the stack, and runs the maintenance scripts described in step 6. `docker compose up --build -d` also works for a brand-new setup, but it does not refresh frontend packages in an existing setup.

This starts the five development services: PostgreSQL, PHP API, Vite frontend, Mailpit, and loopback-only pgAdmin. On a new PostgreSQL volume, the database, application role, schema, and pending additive migrations are created automatically. Startup never loads demo data, drops tables, or truncates the database.

The default `docker-compose.yml` intentionally falls back to `APP_ENV=development` when `.env` is absent; this supports a safe local developer stack and is not a production deployment path. The single-server/production-like Compose definition requires explicit environment and provider settings, and the startup validator fails closed when mock providers or Mailpit are selected there.

### 5. Verify the local services

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| API health | http://localhost:8080/api/health |
| Mailpit | http://localhost:8025 |
| pgAdmin | http://127.0.0.1:5050 |

### 6. Load demo data manually (optional)

Demo users and academic/clinical records are intentionally separate from startup. The seed loads only into a database that has **no students yet** (a new volume); on any other database it does nothing.

Either paste all of [`database/seeds/development-demo.sql`](database/seeds/development-demo.sql) into pgAdmin's **Query Tool** for the `dentisys` database and execute it, or run:

```powershell
docker compose cp database/seeds/development-demo.sql db:/tmp/development-demo.sql
docker compose exec -T db psql -U postgres -d dentisys -v ON_ERROR_STOP=1 -f /tmp/development-demo.sql
```

The seed is transaction-wrapped and non-destructive: it makes no schema changes and never drops, truncates, updates, or deletes data. All people and records are fictional.

After seeding, run `.\scripts\start-dev.ps1` again (or the commands below). It runs three maintenance scripts inside the `web` container:

- `backend/bin/bootstrap-grade-weights.php` gives every class offering without grade weights a starting configuration (the course's component ratios, a 40 / 60 Midterm / Final split, and attendance date ranges from the class term), so seeded classes can be graded.
- `backend/bin/bootstrap-first-dean.php` (REG-010): on a database with no Dean account, it invites the Dean named by `FIRST_DEAN_EMAIL`, `FIRST_DEAN_FIRST_NAME` and `FIRST_DEAN_LAST_NAME` in `.env` (optional `FIRST_DEAN_PREFIX`, `FIRST_DEAN_MIDDLE_NAME`, `FIRST_DEAN_SUFFIX`). The invitation arrives by e-mail (Mailpit in development) and is accepted like a Faculty invitation. It does nothing once a Dean account is active.
- `backend/bin/expire-biometrics.php` deletes biometric references whose validity has ended or whose Student is no longer active (BIO-005). Consent and attendance history are kept.

```powershell
docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php
docker compose exec web php /var/www/html/backend/bin/bootstrap-first-dean.php
docker compose exec web php /var/www/html/backend/bin/expire-biometrics.php
```

`bootstrap-grade-weights.php` and `expire-biometrics.php` accept `--dry-run`.

These are committed local development/demo credentials only. Do not reuse them outside development or testing. Every account of a role shares that role's password.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bicol-u.edu.ph` | `Admin123!` |
| Faculty | `faculty@bicol-u.edu.ph` | `Faculty123!` |
| Secretary | `secretary@bicol-u.edu.ph` | `Secretary123!` |
| Student | `student@bicol-u.edu.ph` | `Student123!` |

The complete list (10 faculty, 8 class secretaries, 120 students, and students without an account for invitation testing) is in [docs/demo-accounts.md](docs/demo-accounts.md).

### 7. Daily development commands

```powershell
docker compose up -d
docker compose logs -f web
.\scripts\migrate.ps1
.\scripts\smoke.ps1 -CheckPgAdmin
docker compose down
```

Run migrations after pulling schema changes. `docker compose down` stops the stack but preserves all volumes and local data. `docker compose down -v` deletes the PostgreSQL volume and is destructive—use it only when intentionally discarding local database data.

For a detailed walkthrough, test commands, and the safe pgAdmin-only reset, see [the development environment guide](docs/development-environment.md).

### 8. Upgrading an existing setup (or switching branches)

Use this when you already ran an older DentiSys build on your device (you have a `.env` and a database volume) and want to run the current code. Your local data is kept.

1. **Stop the stack, keeping its data.** Never add `-v`; it deletes the database volume.

   ```powershell
   docker compose down
   ```

2. **Back up the database.** New migrations change the schema and some existing records (for example, Class Secretary accounts are linked to their Student records). A backup lets you go back.

   ```powershell
   New-Item -ItemType Directory -Force backups | Out-Null
   docker compose up -d --wait db
   docker compose exec -T db pg_dump -U postgres -d dentisys -Fc -f /tmp/dentisys-before-upgrade.dump
   docker compose cp db:/tmp/dentisys-before-upgrade.dump backups/dentisys-before-upgrade.dump
   ```

   `backups/` is ignored by git. Keep the file private: it contains all local data.

3. **Get the code.**

   ```powershell
   git fetch origin
   git switch lumbanglighthal-owhie
   git pull
   ```

4. **Check `.env` against `.env.example`.** Your `.env` keeps working; newer optional settings use safe defaults when absent:
   - `EMAIL_ALLOWLIST_ENABLED` / `EMAIL_TEST_ALLOWLIST`: while the allowlist is enabled (the default in every environment, including single-server), Faculty notices (At-Risk, Privacy Consent) reach only the listed addresses; other notices are recorded as "Suppressed (test mode)". Add your test addresses to see them in Mailpit. Set `EMAIL_ALLOWLIST_ENABLED=false` only when the deployment should email real recipients.
   - `FIRST_DEAN_*`: only used on a database without a Dean account.

5. **Start the system with the script** (not plain `docker compose up`):

   ```powershell
   .\scripts\start-dev.ps1
   ```

   It applies the pending migrations, rebuilds the images, reinstalls the frontend packages because `package-lock.json` changed, and runs the maintenance scripts (grade-weight bootstrap, first-Dean invitation, biometric expiry sweep).

6. **Refresh host test dependencies** if you run builds or browser tests on your device:

   ```powershell
   npm ci
   npm --prefix frontend ci
   ```

**What users will notice after upgrading:** Class Secretaries sign in with their own Student account (the sidebar toggle switches to their Student pages); new attendance sessions need a class end time and end automatically at that time; Secretaries request Excused and Faculty approve or reject it; the Full Matrix View uses the class-record layout.

**Troubleshooting**
- *Frontend shows "Failed to resolve import" (for example `leaflet`)*: run `.\scripts\start-dev.ps1` again, or `docker compose run --rm --no-deps frontend npm ci`, then `docker compose restart frontend`.
- *A migration fails*: stop, do not retry repeatedly, and report the error. To return to the backup, switch back to your previous branch and restore it (this replaces the current local data):

  ```powershell
  docker compose up -d --wait db
  docker compose cp backups/dentisys-before-upgrade.dump db:/tmp/restore.dump
  docker compose exec -T db pg_restore -U postgres -d dentisys --clean --if-exists /tmp/restore.dump
  ```

## Same-host single-server deployment foundation

The Compose files and start script can launch Nginx, the PHP API, and internal PostgreSQL on one private host. This is an **unfinished private-LAN prototype**, not a supported production deployment process. DentiSys does not yet have the operational deployment workflow used by LearningFullStack.

For controlled implementation testing only:

```powershell
Copy-Item .env.single-server.example .env.single-server
.\scripts\start-single-server.ps1
```

Before starting, set unique database/admin passwords, application signing/encryption keys, and real SMTP values in `.env.single-server`. The stack publishes only the frontend HTTP port; Vite, Mailpit, pgAdmin, and a PostgreSQL host port are intentionally absent.

It is not ready for production or public-internet use. A complete deployment process still needs a defined runbook, TLS/reverse-proxy policy, firewall guidance, backups and restore testing, secret handling, monitoring, upgrade/rollback procedures, and deployment automation. See [the single-server deployment foundation](docs/single-server.md).

## Future: separate application and database servers

This model is unsupported and non-runnable. It requires external PostgreSQL connectivity and credential rotation, restricted network policy, TLS/reverse-proxy configuration, tested backups/restores, secret management, monitoring, and deployment automation. No provisional commands are provided.

## Validation

Use the smallest relevant check while coding. `check.ps1` is the normal aggregate check for ordinary runtime changes; `check-postgres.ps1` is the isolated integration check for database, authentication, runtime-sensitive, milestone, and final work. Do not repeat commands already included in a successful aggregate check unless diagnosing a failure.

| Change | While iterating | Before handoff |
| --- | --- | --- |
| Documentation or instructions | `git diff --check` and targeted reference checks | Run the documentation contract when its covered files or migration naming changes. |
| Frontend or backend runtime | Relevant build/test | `./scripts/check.ps1` |
| Dockerfiles, dependency locks, or Compose build config | `docker compose config --quiet` and build the affected service | `./scripts/check.ps1`; add PostgreSQL integration when runtime behavior is affected. |
| Database, authentication, or milestone/final work | Relevant targeted checks | `./scripts/check.ps1` and `./scripts/check-postgres.ps1` |

Run `./scripts/migrate.ps1` only when applying or verifying migrations against an existing development database. Run `./scripts/smoke.ps1` only when checking a running stack.

For the normal developer loop, start the application with `.\scripts\start-dev.ps1`, make a change, then run the smallest relevant validation above. Use pgAdmin only for manual data inspection or SQL; it is not required for automated tests.

## Documentation

- [Authoritative product specification](spec.md)
Start with [the documentation index](docs/README.md).
