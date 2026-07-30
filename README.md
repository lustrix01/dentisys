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
- Node.js 18 or newer for frontend builds and browser tests.
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

### 4. Start the complete development system

```powershell
docker compose up --build -d
```

This starts the five development services: PostgreSQL, PHP API, Vite frontend, Mailpit, and loopback-only pgAdmin. On a new PostgreSQL volume, the database, application role, schema, and pending additive migrations are created automatically. Startup never loads demo data, drops tables, or truncates the database.

### 5. Verify the local services

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| API health | http://localhost:8080/api/health |
| Mailpit | http://localhost:8025 |
| pgAdmin | http://127.0.0.1:5050 |

### 6. Load demo data manually (optional)

Demo users and academic/clinical records are intentionally separate from startup.

1. Sign in to pgAdmin with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from `.env`.
2. Select the preconfigured **DentiSys PostgreSQL (development)** server and enter `DB_PASS` when prompted.
3. Select the `dentisys` database, then open **Tools → Query Tool**.
4. Copy all of [`database/seeds/development-demo.sql`](database/seeds/development-demo.sql) into Query Tool and execute it.

The seed is transaction-wrapped and non-destructive: it does not change schema, drop or truncate data, and skips rows already present.

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

Use the smallest relevant check while coding, then run both aggregate checks before handing off a significant change. `check.ps1` includes the frontend build and mocked E2E suite; `check-postgres.ps1` includes migrations, seed checks, smoke checks, PostgreSQL integration tests, and live E2E. You do not need to run the individual commands again after their aggregate check unless you are diagnosing a failure.

```powershell
# Verify Compose file parsing, environment interpolation, paths, and service configuration.
docker compose config --quiet

# Fast regression suite for ordinary frontend or backend changes. Validates Compose,
# builds the frontend, lints PHP, runs backend unit tests, and runs mocked Playwright E2E.
.\scripts\check.ps1

# Full isolated PostgreSQL suite. Creates and removes its own test stack and volumes;
# verifies migrations and seed idempotency, PHP/PostgreSQL integration, API smoke checks,
# live Playwright flows, Mailpit delivery, and database/application logs.
.\scripts\check-postgres.ps1

# Apply any newly added ordered PostgreSQL migrations to the running development database.
# Run after editing or pulling migrations; start-dev.ps1 already runs this on startup.
.\scripts\migrate.ps1

# Confirm the running development API and database are healthy; -CheckPgAdmin also
# verifies the optional pgAdmin service. This does not modify data.
.\scripts\smoke.ps1 -CheckPgAdmin

# Compile the production frontend bundle and catch TypeScript/Vite build failures.
npm run build

# Run the fast mocked UI Playwright suite only. Included in check.ps1.
npm run test:e2e

# Run live Playwright tests only against an already-running disposable integration stack.
# Normally invoked by check-postgres.ps1 rather than run directly.
npm run test:e2e:live
```

For the normal developer loop, start the application with `.\scripts\start-dev.ps1`, make a change, then run the smallest relevant validation above. Use pgAdmin only for manual data inspection or SQL; it is not required for automated tests.

## Documentation

Start with [the documentation index](docs/README.md).
