# Development Environment

This is the supported DentiSys runtime. It runs the complete development system on one device with Docker Compose.

```text
Browser -> Vite frontend -> PHP API -> PostgreSQL
                         -> Mailpit
pgAdmin -----------------> PostgreSQL
```

All containers communicate over Docker's internal network. PostgreSQL is not published to the host.

## 1. Prerequisites

Install Docker Desktop and make sure `docker compose version` succeeds. Install Node.js 18 or newer if you will build the frontend or run browser tests. Install Playwright Chromium only when you intend to run end-to-end tests.

```powershell
npm ci
npx playwright install chromium
```

Those two commands are not required simply to start the Docker application stack. DentiSys has no native PHP, XAMPP, MySQL/MariaDB, or phpMyAdmin runtime path.

## 2. Create local configuration

At the repository root, create your untracked development configuration:

```powershell
Copy-Item .env.example .env
```

Use `.env` for development values only. Do not commit it.

## 3. Start the full development stack

```powershell
docker compose up --build -d
```

Docker Compose automatically includes the development pgAdmin definition. The command starts PostgreSQL, the PHP API, Vite frontend, Mailpit, and pgAdmin.

For a new PostgreSQL volume, initialization automatically creates the database and application role, then applies ordered additive migrations. It does not load demo records and never drops or truncates your database.

## 4. Verify services

| Service | URL | Purpose |
| --- | --- | --- |
| Frontend | http://localhost:5173 | DentiSys UI |
| API health | http://localhost:8080/api/health | API and database health |
| Mailpit | http://localhost:8025 | Development email inbox |
| pgAdmin | http://127.0.0.1:5050 | PostgreSQL browser and query tool |

If a service does not load, inspect its logs:

```powershell
docker compose logs -f web
docker compose logs -f db
```

## 5. Use pgAdmin and load optional demo data

1. Open http://127.0.0.1:5050.
2. Sign in with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from `.env`.
3. The **DentiSys PostgreSQL (development)** server is already registered. Select it and enter `DB_PASS` from `.env` when prompted.
4. Browse data at **Databases → dentisys → Schemas → public → Tables**.
5. To load demo data, select `dentisys`, then choose **Tools → Query Tool**.
6. Open [`database/seeds/development-demo.sql`](../database/seeds/development-demo.sql), copy its complete contents into Query Tool, and select **Execute**.

The manual seed contains documented demo accounts, courses, classes, students, grades, and attendance records. It is safe to rerun: it is transaction-wrapped, makes no schema changes, never drops or truncates data, and skips rows already present.

## 6. Daily lifecycle and validation

```powershell
# Start existing containers without rebuilding
docker compose up -d

# Follow API logs
docker compose logs -f web

# Apply newly added migrations without resetting data
.\scripts\migrate.ps1

# Check application and pgAdmin health
.\scripts\smoke.ps1 -CheckPgAdmin

# Stop containers while preserving all local data
docker compose down
```

Run `docker compose down -v` only when you intentionally want to delete your local PostgreSQL data. It removes the persisted database volume.

### Reset only pgAdmin state

To remove saved pgAdmin preferences and sessions without touching PostgreSQL:

```powershell
docker compose stop pgadmin
docker compose rm -f pgadmin
docker volume rm dentisys_pgadmin_data
docker compose up -d pgadmin
```

This removes only the pgAdmin volume; it does not remove `dentisys_postgres_18_data`.

## Database and live integration validation

Run the full disposable PostgreSQL validation stack with:

```powershell
.\scripts\check-postgres.ps1
```

It creates a separate integration Compose project, applies the manual demo seed twice, checks migrations, roles, sequences, logs, PHP integration paths, and live browser scenarios, then removes that test project. It never resets your normal development database. Add `-KeepStack` only when you need to inspect the disposable test environment.

When an already-running test stack is configured through `E2E_BASE_URL`, the live browser suite is also available through:

```powershell
npm run test:e2e:live
```

