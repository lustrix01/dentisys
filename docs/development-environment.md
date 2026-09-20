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
./scripts/start-dev.ps1
```

The migration-safe launcher starts PostgreSQL first, waits for its health check, applies pending migrations, and then starts the PHP API, Vite frontend, Mailpit, and pgAdmin. Use `./scripts/start-dev.ps1 -NoBuild` when images are already built. On Unix-like hosts, use `./scripts/start-dev.sh`.

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

The manual seed contains documented demo accounts, courses, classes, students, grades, and attendance records. It is safe to rerun: it is transaction-wrapped, makes no schema changes, never drops or truncates data, and skips rows already present. Normal startup and migrations do not load demo data. The seeded accounts remain available across ordinary container restarts and `docker compose down` while the PostgreSQL volume remains. `docker compose down -v` removes that volume, including the seeded demo accounts and all other local DentiSys database data; use it only when intentionally discarding local data.

### Primary demo accounts

These committed credentials are for local development/testing only. They exist only after the optional development seed has been applied and must not be reused outside development or testing.

| Role | Email | Password | Status |
| --- | --- | --- | --- |
| Admin | `admin@bicol-u.edu.ph` | `Admin123!` | Active |
| Faculty | `faculty@bicol-u.edu.ph` | `Faculty123!` | Active |
| Secretary | `secretary@bicol-u.edu.ph` | `Secretary123!` | Active |
| Student | `student@bicol-u.edu.ph` | `Student123!` | Active |

Additional Faculty fixtures use `Faculty123!`: `dr.reyes@bicol-u.edu.ph`, `dr.cruz@bicol-u.edu.ph`, `dr.aquino@bicol-u.edu.ph`, and `dr.torres@bicol-u.edu.ph` are Active. Legacy `pending.faculty1@bicol-u.edu.ph` and `pending.faculty2@bicol-u.edu.ph` fixtures remain inactive and are not activated automatically; an Admin must explicitly issue a new invitation before either can establish access. See [`database/seeds/development-demo.sql`](../database/seeds/development-demo.sql) for the complete current fixture set.

### Google Sign-In Phase 1 testing

A seeded DentiSys account is not automatically a real Google identity. For example, `faculty@bicol-u.edu.ph` can be used for real Google Sign-In only when that exact address is an allowed Google Workspace identity controlled by the tester; storing the email in PostgreSQL does not make Google recognize it.

Recommended workflow:

1. Use the seeded Admin, Faculty, Secretary, and Student accounts for ordinary role testing.
2. For real Google Sign-In, use a real allowed institutional Google Workspace account controlled by the tester.
3. Ensure an existing DentiSys account has a `login_email` exactly matching that Google account, provisioning it through the applicable existing DentiSys workflow when necessary.
4. Start first-time Google Sign-In.
5. Confirm the existing DentiSys password.
6. Complete existing MFA when enabled.
7. Confirm successful subject binding and login.
8. Log out and verify returning Google Sign-In.
9. Log out again.
10. Verify email + password Sign-In still works.

Phase 1 does not auto-create DentiSys accounts, and Google does not replace the DentiSys password. One Google subject cannot be bound to multiple DentiSys accounts, so do not reuse one real Google identity across the Admin, Faculty, Secretary, and Student demo accounts. Never write Google ID tokens, passwords, MFA codes, OAuth secrets, or real personal credentials into repository documentation or logs.

### P03 Student authentication fixture

The optional development fixture includes `student@bicol-u.edu.ph / Student123!`, a canonical `student_account_user_id` link, and one active enrollment. An established eligible Student account can authenticate with email/password or Google whenever Google is configured; `STUDENT_AUTH_ENABLED` does not disable those normal login methods. The flag gates Student invitation inspection/activation and the server-issued development mock session. Student onboarding begins only from a Faculty-issued invitation tied to the canonical Student and active class enrollment. The development mock endpoint is backend-issued and rejected outside development/test; the browser never fabricates Student credentials.

Student activation mail is delivered to Mailpit when the feature is enabled. The activation URL contains a one-time raw token; the token is scrubbed from the browser address bar immediately and is not stored in localStorage, sessionStorage, or auth context.

## 6. Daily lifecycle and validation

```powershell
# Start existing containers without rebuilding, including migration safety
./scripts/start-dev.ps1 -NoBuild

# Follow API logs
docker compose logs -f web

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
