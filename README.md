# DentiSys

DentiSys is an academic and clinical management system for the Bicol University College of Dental Medicine. It runs entirely in Docker: a React/Vite frontend, a plain PHP API, PostgreSQL, a private face-recognition sidecar, and Mailpit for catching e-mail.

| Runtime | Status | Use it for |
| --- | --- | --- |
| [Development environment](#part-a-development-environment) | **Supported** | Daily development and local testing on one computer |
| [Single-server mode](#part-b-single-server-mode-future) | **Unfinished prototype** | Controlled testing on one private-network server; future deployment path |
| Separate application and database servers | **Not implemented** | Future work |

**Contents**

- [Part A: Development environment](#part-a-development-environment)
  - [A1. Install the prerequisites](#a1-install-the-prerequisites)
  - [A2. Get the code](#a2-get-the-code)
  - [A3. Create your `.env`](#a3-create-your-env)
  - [A4. Start DentiSys](#a4-start-dentisys)
  - [A5. Open the services](#a5-open-the-services)
  - [A6. Get a first account](#a6-get-a-first-account)
  - [A7. Choose how e-mail is delivered](#a7-choose-how-e-mail-is-delivered)
  - [A8. Optional: face-recognition attendance](#a8-optional-face-recognition-attendance)
  - [A9. Optional: test on a phone](#a9-optional-test-on-a-phone)
  - [A10. Everyday commands](#a10-everyday-commands)
  - [A11. Upgrading an existing setup or switching branches](#a11-upgrading-an-existing-setup-or-switching-branches)
  - [A12. Running the tests](#a12-running-the-tests)
- [Part B: Single-server mode (future)](#part-b-single-server-mode-future)
- [Validation rules for contributors](#validation-rules-for-contributors)
- [Documentation](#documentation)

> **Ground rules.** DentiSys runs through Docker Compose only; do not use XAMPP, native PHP, or MySQL/MariaDB. Never commit `.env` files. Never run `docker compose down -v` unless you mean to erase your local database.

---

## Part A: Development environment

Everything runs on your computer as Docker containers. PostgreSQL is reachable only inside Docker's network; it has no port on your computer.

```text
Browser -> Vite frontend (5173) -> PHP API (8080) -> PostgreSQL
                                                  -> Mailpit (8025)
                                                  -> Face-recognition sidecar
pgAdmin (5050) -----------------------------------> PostgreSQL
```

### A1. Install the prerequisites

| Tool | Needed for | Notes |
| --- | --- | --- |
| [Git](https://git-scm.com/downloads) | Getting the code | Windows: keep the default "checkout Windows-style line endings". |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Running DentiSys | Start it and wait until it says *Engine running*. `docker compose version` must work. |
| [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended) | Only for running tests or building the frontend on your computer | Not needed just to run DentiSys. Node 18 does not work (Vite 8). |

### A2. Get the code

```powershell
git clone https://github.com/lustrix01/dentisys.git
cd dentisys
git switch lumbanglighthal-owhie
```

### A3. Create your `.env`

```powershell
Copy-Item .env.example .env
```

On macOS or Linux: `cp .env.example .env`.

The example already contains safe development defaults, so DentiSys starts without editing it. `.env` is ignored by Git; keep it that way.

### A4. Start DentiSys

```powershell
.\scripts\start-dev.ps1
```

- Windows alternative: double-click `start-dev.bat`.
- macOS or Linux: `./scripts/start-dev.sh`.

The first run downloads and builds images and takes several minutes. The script:

1. starts PostgreSQL and applies any pending database migrations (a new database is created automatically);
2. builds the images and installs frontend packages when `frontend/package-lock.json` changed;
3. starts all services;
4. runs three maintenance scripts: grade-weight setup for classes that have none, the first-Dean invitation ([A6](#a6-get-a-first-account)), and the expired-biometrics sweep.

Starting never loads demo data, drops tables, or deletes records. Run the same script again any time; it is safe to repeat.

### A5. Open the services

| Service | Address | What it is |
| --- | --- | --- |
| DentiSys | http://localhost:5173 | The application |
| API health | http://localhost:8080/api/health | Should report `"status": "ok"` |
| Mailpit | http://localhost:8025 | Every e-mail DentiSys sends in development lands here |
| pgAdmin | http://127.0.0.1:5050 | Database browser (sign-in values are `PGADMIN_DEFAULT_*` in `.env`) |

### A6. Get a first account

A new database has no users. Pick one of the two options.

**Option 1: load the demo data** (recommended for development). It adds fictional Deans, Faculty, Secretaries, Students, classes, and records. It loads only into a database with no students yet, and does nothing otherwise.

```powershell
docker compose cp database/seeds/development-demo.sql db:/tmp/development-demo.sql
docker compose exec -T db psql -U postgres -d dentisys -v ON_ERROR_STOP=1 -f /tmp/development-demo.sql
.\scripts\start-dev.ps1
```

You can also paste [`database/seeds/development-demo.sql`](database/seeds/development-demo.sql) into pgAdmin's **Query Tool** and run it. Re-running `start-dev.ps1` afterwards gives the seeded classes their grade weights.

Development-only credentials (every account of a role shares the password):

| Role | E-mail | Password |
| --- | --- | --- |
| Dean (Admin) | `admin@bicol-u.edu.ph` | `Admin123!` |
| Faculty | `faculty@bicol-u.edu.ph` | `Faculty123!` |
| Secretary | `secretary@bicol-u.edu.ph` | `Secretary123!` |
| Student | `student@bicol-u.edu.ph` | `Student123!` |

The full list is in [docs/demo-accounts.md](docs/demo-accounts.md). Never reuse these outside your own computer.

**Option 2: invite a real first Dean** (starts from an empty system). In `.env`, fill in:

```dotenv
FIRST_DEAN_EMAIL=your.name@bicol-u.edu.ph
FIRST_DEAN_FIRST_NAME=Your
FIRST_DEAN_LAST_NAME=Name
```

`FIRST_DEAN_PREFIX`, `FIRST_DEAN_MIDDLE_NAME`, and `FIRST_DEAN_SUFFIX` are optional. The address must use an allowed domain (`ALLOWED_EMAIL_DOMAINS`). Run `.\scripts\start-dev.ps1`; the invitation appears in Mailpit. Open its link, set a password, and sign in. Nothing happens once a Dean account is active.

### A7. Choose how e-mail is delivered

`EMAIL_PROVIDER` in `.env` controls every e-mail DentiSys sends (invitations, password resets, notices):

| `EMAIL_PROVIDER` | Recipients on `EMAIL_TEST_ALLOWLIST` | Everyone else |
| --- | --- | --- |
| `mailpit` (default) | Mailpit only | Mailpit only |
| `smtp` | Real e-mail | Real e-mail |
| `custom` | Real e-mail **and** a Mailpit copy | Mailpit only |

`smtp` and `custom` need a real SMTP account in the `SMTP_*` settings. For example, a Google account with an [App Password](https://support.google.com/accounts/answer/185833):

```dotenv
EMAIL_PROVIDER=custom
EMAIL_TEST_ALLOWLIST=your.name@bicol-u.edu.ph,tester.*@bicol-u.edu.ph
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_ENCRYPTION=starttls
SMTP_VERIFY_PEER=true
SMTP_USER=your.sender@gmail.com
SMTP_PASS=<16-character App Password>
SMTP_FROM=your.sender@gmail.com
```

The allowlist is comma-separated, and `*` matches anything. In `custom` mode, Faculty notices to people not on the list are recorded as "Suppressed (test mode)". After editing `.env`, run `docker compose up -d` to apply it.

### A8. Optional: face-recognition attendance

DentiSys starts and works without this; biometric attendance just reports that it is unavailable, and manual attendance still works. To enable it:

1. **Download the face-landmark model** (about 3.8 MB) to a folder **next to** the repository, not inside it:

   ```powershell
   New-Item -ItemType Directory -Force ..\dentisys-biometric-assets | Out-Null
   Invoke-WebRequest https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task -OutFile ..\dentisys-biometric-assets\face_landmarker.task
   (Get-FileHash ..\dentisys-biometric-assets\face_landmarker.task -Algorithm SHA256).Hash.ToLower()
   ```

   The hash must be `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

2. **Generate two secrets** (run twice; use one output for each):

   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```

   On macOS or Linux: `openssl rand -base64 32`.

3. **Fill in `.env`:**

   ```dotenv
   BIOMETRIC_SIDECAR_URL=http://biometric:8000
   BIOMETRIC_SIDECAR_SHARED_SECRET=<first generated value>
   BIOMETRIC_STORAGE_KEY_B64=<second generated value>
   MEDIAPIPE_FACE_LANDMARKER_SHA256=64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
   ```

   Also set the `BIOMETRIC_HAAR_*`, `BIOMETRIC_QUALITY_*`, `BIOMETRIC_LBPH_*`, `BIOMETRIC_MATCH_COUNT`, `BIOMETRIC_BLINK_THRESHOLD`, and `BIOMETRIC_HEAD_TURN_RATIO` values from the table in [docs/biometric-calibration-deployment.md](docs/biometric-calibration-deployment.md). Keep `DEV_MOCK_BIOMETRIC_ENABLED=false`.

4. Run `.\scripts\start-dev.ps1`. `docker compose ps` should show `biometric` as healthy.

These are provisional development values, not validated production thresholds.

### A9. Optional: test on a phone

The camera works only over HTTPS. To open the development site from a phone on the same Wi-Fi:

```powershell
.\scripts\dev-lan-https.ps1
```

It creates a self-signed certificate, exposes the frontend on your network, and prints the phone address. Anyone on that network can reach the site while this is on. Turn it off with `.\scripts\dev-lan-https.ps1 -Disable`. Details, including the firewall rule, are in [docs/development-environment.md](docs/development-environment.md).

### A10. Everyday commands

```powershell
.\scripts\start-dev.ps1                    # start or update everything (safe to repeat)
docker compose ps                          # what is running
docker compose logs -f web                 # follow the API log
.\scripts\migrate.ps1                      # apply new migrations to a running stack
.\scripts\smoke.ps1 -CheckPgAdmin          # quick health check of a running stack
docker compose down                        # stop; keeps your data
```

`docker compose down -v` **deletes your local database**. Use it only when you really mean to start over.

### A11. Upgrading an existing setup or switching branches

Use this if you already ran an older DentiSys build (you have a `.env` and a database). Your data is kept.

1. **Stop the stack, keeping its data:** `docker compose down` (never `-v`).

2. **Back up the database.** New migrations change the schema and some records, and a backup lets you go back.

   ```powershell
   New-Item -ItemType Directory -Force backups | Out-Null
   docker compose up -d --wait db
   docker compose exec -T db pg_dump -U postgres -d dentisys -Fc -f /tmp/dentisys-before-upgrade.dump
   docker compose cp db:/tmp/dentisys-before-upgrade.dump backups/dentisys-before-upgrade.dump
   ```

   `backups/` is ignored by Git. Keep the file private; it contains all your local data.

3. **Get the code:**

   ```powershell
   git fetch origin
   git switch lumbanglighthal-owhie
   git pull
   ```

4. **Compare `.env` with `.env.example`** and copy over any settings you want. Your existing `.env` keeps working, because missing settings use safe defaults. See [A7](#a7-choose-how-e-mail-is-delivered) for the e-mail modes and [A6](#a6-get-a-first-account) for `FIRST_DEAN_*`.

5. **Start with the script**, not plain `docker compose up`: `.\scripts\start-dev.ps1`. It applies the migrations, rebuilds images, refreshes frontend packages, and runs the maintenance scripts.

6. **If you run tests on your computer**, refresh their packages: `npm ci` and `npm --prefix frontend ci`.

**Troubleshooting**

- *The frontend shows "Failed to resolve import" (for example `leaflet`):* run `.\scripts\start-dev.ps1` again, or `docker compose run --rm --no-deps frontend npm ci` then `docker compose restart frontend`.
- *A migration fails:* stop, do not keep retrying, and report the error. To return to your backup, switch back to your previous branch and restore it. This replaces the current local data:

  ```powershell
  docker compose up -d --wait db
  docker compose cp backups/dentisys-before-upgrade.dump db:/tmp/restore.dump
  docker compose exec -T db pg_restore -U postgres -d dentisys --clean --if-exists /tmp/restore.dump
  ```

### A12. Running the tests

One-time setup on your computer (needs Node.js, see [A1](#a1-install-the-prerequisites)):

```powershell
npm ci
npx playwright install chromium
```

| Command | What it runs | Needs |
| --- | --- | --- |
| `.\scripts\check.ps1` | Config, PHP and TypeScript checks, backend tests, frontend build, mocked browser tests | Docker running and the images built once by `start-dev.ps1` |
| `.\scripts\check-postgres.ps1` | Database integration tests and live browser tests in a separate, throw-away Docker project | Docker; it never touches your development database |
| `npm run test:e2e -- e2e/<file>.spec.ts` | One mocked browser test file (all API calls are faked) | Only the Node packages above |

---

## Part B: Single-server mode (future)

> **Status: unfinished prototype.** Single-server mode runs DentiSys on one server in a private network, using production-style images: Nginx serving the built frontend, the PHP API, PostgreSQL, and the face-recognition sidecar. It is **not ready for production or the public internet**. Use it only for controlled testing. The gaps are listed at the end of this part.

```text
Browser -> Nginx frontend (APP_HTTP_PORT, default 8080) -> PHP API -> PostgreSQL
                                                                   -> Face-recognition sidecar
                                                                   -> SMTP server (and Mailpit in custom mode)
```

Only the frontend port is published. PostgreSQL, the API, and the sidecar are reachable only inside Docker. Vite and pgAdmin are not included.

### B1. Prepare the server

- A Linux or Windows server with Docker Engine and the Compose plugin (`docker compose version` must work), plus Git.
- A fixed private address or hostname that users' browsers will use.
- A real SMTP account for sending e-mail.

### B2. Get the code

```bash
git clone https://github.com/lustrix01/dentisys.git
cd dentisys
git switch lumbanglighthal-owhie
cp .env.single-server.example .env.single-server
```

On Windows: `Copy-Item .env.single-server.example .env.single-server`.

### B3. Fill in `.env.single-server`

Every value that starts with `replace_with_` must be replaced; the start script refuses to run otherwise.

| Setting | What to put there |
| --- | --- |
| `APP_BASE_URL` | The exact address users open, for example `http://dentisys.lan:8080`. Invitation and reset links use it. |
| `APP_HTTP_PORT` | The published port (default `8080`). |
| `APP_IS_HTTPS` | `true` only when users reach DentiSys over HTTPS. |
| `DB_PASS`, `DB_ADMIN_PASS` | Two different strong passwords. |
| `JWT_SIGNING_KEY_B64`, `MFA_ENCRYPTION_KEY_B64`, `AUDIT_MAC_KEY_B64`, `BIOMETRIC_STORAGE_KEY_B64`, `BIOMETRIC_SIDECAR_SHARED_SECRET` | A different generated value for each (see below). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Your SMTP account. Encryption (`starttls` or `tls`) and certificate checking are required. |
| `EMAIL_PROVIDER`, `EMAIL_TEST_ALLOWLIST` | `smtp` to e-mail everyone, or `custom` to send real e-mail only to the allowlist and keep a copy of everything in Mailpit (see [A7](#a7-choose-how-e-mail-is-delivered)). |
| `ALLOWED_EMAIL_DOMAINS` | Institutional domains allowed to sign in (default `bicol-u.edu.ph`). |
| `MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH`, `MEDIAPIPE_FACE_LANDMARKER_SHA256` | Absolute path to the downloaded model and its hash (see [A8](#a8-optional-face-recognition-attendance), step 1). |
| `BIOMETRIC_*` calibration values | From [docs/biometric-calibration-deployment.md](docs/biometric-calibration-deployment.md). Biometric attendance still stays off in single-server mode until it is approved for deployment. |

Generate each secret separately:

```bash
openssl rand -base64 32
```

On Windows, use the PowerShell command in [A8](#a8-optional-face-recognition-attendance), step 2.

Keep `.env.single-server` on the server only. It holds every secret.

### B4. Start it

```bash
./scripts/start-single-server.sh
```

On Windows: `.\scripts\start-single-server.ps1`.

The script checks the required settings and builds and starts the stack under the Compose project name `dentisys-single-server`. On the first start, PostgreSQL creates the database and applies all migrations. With `EMAIL_PROVIDER=custom` it also starts Mailpit. Its page is at `http://127.0.0.1:8025` on the server itself only; from another computer use an SSH tunnel: `ssh -L 8025:127.0.0.1:8025 user@server`.

Check it: open `APP_BASE_URL`, and `APP_BASE_URL/api/health` should report `"status": "ok"`.

### B5. Invite the first Dean

Single-server mode never loads demo data. Create the first account by inviting a Dean. Pass the details to the bootstrap script directly:

```bash
docker compose --env-file .env.single-server -p dentisys-single-server \
  -f docker-compose.web.yml -f docker-compose.database.yml \
  exec -e FIRST_DEAN_EMAIL=dean.name@bicol-u.edu.ph \
       -e FIRST_DEAN_FIRST_NAME=First -e FIRST_DEAN_LAST_NAME=Last \
  web php /var/www/html/backend/bin/bootstrap-first-dean.php
```

The Dean receives an invitation e-mail, sets a password, and then invites Faculty from inside DentiSys.

### B6. Stop it

```bash
docker compose --env-file .env.single-server -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml down
```

As in development, never add `-v`; it deletes the database.

### B7. What is still missing before real use

- **Upgrades:** re-running the start script rebuilds the images, but migrations are applied automatically only when the database is first created. There is no tested upgrade, rollback, or migration procedure for an existing single-server database yet.
- **Maintenance:** the grade-weight setup and the expired-biometrics sweep are not scheduled.
- **Operations:** there is no HTTPS/reverse-proxy setup, firewall guidance, tested backup and restore, secret rotation, or monitoring.
- **Biometrics:** real biometric attendance is disabled outside development until it is approved for deployment.

More detail: [docs/single-server.md](docs/single-server.md).

---

## Validation rules for contributors

Use the smallest relevant check while working, then the gate for the kind of change:

| Change | While iterating | Before handing off |
| --- | --- | --- |
| Documentation or instructions | `git diff --check` and link/reference checks | The documentation contract, when its covered files or migration names change |
| Frontend or backend code | The relevant build or test | `.\scripts\check.ps1` |
| Dockerfiles, dependency locks, Compose files | `docker compose config --quiet` and build the affected service | `.\scripts\check.ps1`, plus `.\scripts\check-postgres.ps1` when runtime behavior changes |
| Database, authentication, milestone, or final work | The relevant targeted checks | `.\scripts\check.ps1` and `.\scripts\check-postgres.ps1` |

Repository rules for contributors and coding agents are in [AGENTS.md](AGENTS.md).

## Documentation

- [Product specification](spec.md): the authoritative source for approved behavior.
- [Documentation index](docs/README.md): architecture, features, database, and guides.
- [Development environment details](docs/development-environment.md)
- [Single-server details](docs/single-server.md)
- [Demo accounts](docs/demo-accounts.md)
