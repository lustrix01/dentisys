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

```powershell
docker compose config --quiet
.\scripts\check.ps1
.\scripts\check-postgres.ps1
.\scripts\migrate.ps1
.\scripts\smoke.ps1 -CheckPgAdmin
npm run build
npm run test:e2e
npm run test:e2e:live
```

`npm run test:e2e` is the fast mocked-UI suite. `scripts/check-postgres.ps1` performs the complete disposable PostgreSQL integration and live browser validation without resetting development data or volumes.

## Documentation

Start with [the documentation index](docs/README.md).

