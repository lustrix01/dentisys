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
5. To load demo data into a new, empty database, select `dentisys`, then choose **Tools → Query Tool**. (Or use the `psql` commands in the README, section 6.)
6. Open [`database/seeds/development-demo.sql`](../database/seeds/development-demo.sql), copy its complete contents into Query Tool, and select **Execute**.
7. Give the seeded classes grade weights (every class needs saved grade weights before it can be graded): run `docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php`, or just run `.\scripts\start-dev.ps1` again, which does this automatically. Add `--dry-run` to only list what would be created. It creates a period configuration for each Faculty course offering that has none (Quiz, Laboratory, Midterm/Final Exam and Attendance, from the course's stored ratios) and links existing assessments; Faculty can change the weights in Grade Computation afterwards. Running it again does nothing.

The manual seed contains documented demo accounts, courses, classes, students, grades, remedial progressions, and attendance history for school years 2024-2025, 2025-2026, and 2026-2027 (current). It loads only when the `students` table is empty; on a database that already has students it inserts nothing, so rerunning it is safe. It makes no schema changes and never drops, truncates, updates, or deletes data. Normal startup and migrations do not load demo data. The seeded accounts remain available across ordinary container restarts and `docker compose down` while the PostgreSQL volume remains. `docker compose down -v` removes that volume, including the seeded demo accounts and all other local DentiSys database data; use it only when intentionally discarding local data.

### Primary demo accounts

These committed credentials are for local development/testing only. They exist only after the optional development seed has been applied and must not be reused outside development or testing.

| Role | Email | Password | Status |
| --- | --- | --- | --- |
| Admin | `admin@bicol-u.edu.ph` | `Admin123!` | Active |
| Faculty | `faculty@bicol-u.edu.ph` | `Faculty123!` | Active |
| Secretary | `secretary@bicol-u.edu.ph` | `Secretary123!` | Active |
| Student | `student@bicol-u.edu.ph` | `Student123!` | Active |

All other demo accounts (10 active faculty, 2 inactive applicant faculty, 8 class secretaries, and 120 students) are listed with their sections in [demo-accounts.md](demo-accounts.md). Every account of a role uses that role's password. The Admin account is limited to the Admin pages. No face (biometric) profiles are seeded; complete Face Registration before testing biometric attendance.

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

## Sending real email in development

By default every email (invitations, password resets, notifications) is caught by Mailpit at http://localhost:8025 and never leaves your computer. To deliver real email, set these in your own `.env` (never commit it): `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION=starttls` (or `tls`), `SMTP_VERIFY_PEER=true`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` — see the commented example in `.env.example`. Then run `docker compose up -d web` so the container picks up the change. Encrypted SMTP with certificate checking is required whenever `EMAIL_PROVIDER=smtp`.

Warnings:
- Real email goes to the recipient's real address. Demo accounts use `@bicol-u.edu.ph` addresses that may belong to real people, so do not send invitations or password resets to demo accounts while real email is on. Test with your own address instead.
- Links inside emails use `APP_BASE_URL` (`http://localhost:5173` by default), so they only open on the computer that runs DentiSys.
- `check-postgres.ps1` and the automated tests always use Mailpit, whatever `.env` says.
- Switch back to Mailpit by setting `EMAIL_PROVIDER=mailpit` and `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_ENCRYPTION=none`, `SMTP_VERIFY_PEER=false`, then `docker compose up -d web`.

## Testing on a phone (same Wi-Fi)

Phone browsers allow the camera (face registration and biometric attendance) only on HTTPS or `localhost`, so the phone needs an HTTPS address for your PC. For development only:

1. Run `.\scripts\dev-lan-https.ps1`. It creates a self-signed certificate for your PC's LAN address in `frontend/certs/` (git-ignored, valid 30 days), sets `FRONTEND_BIND_ADDRESS=0.0.0.0` and `VITE_DEV_HTTPS=true` in `.env`, and restarts the frontend container.
2. On the phone, open the `https://<your-PC-IP>:5173` address the script prints and accept the certificate warning (Advanced > Proceed).
3. If the phone cannot connect, allow the port once from an administrator PowerShell: `New-NetFirewallRule -DisplayName "DentiSys dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`.

Notes:
- While this is on, your PC uses `https://localhost:5173` too.
- Google sign-in does not work from a LAN address or from `https://localhost` unless that origin is added to the Google OAuth client; sign in with a password when testing on the phone.
- Anyone on the same network can reach the dev site while this is on. Turn it off with `.\scripts\dev-lan-https.ps1 -Disable`.
