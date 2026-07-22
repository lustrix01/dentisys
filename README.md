# DentiSys

DentiSys is being organized as a local full-stack repository with a preserved React/Vite frontend and a minimal plain-PHP API foundation. Business APIs and the DentiSys domain database schema are not implemented yet.

## Project Map

```text
frontend/   Existing React 19, TypeScript, Vite, TailwindCSS app
backend/    Plain PHP API foundation served from backend/public
database/   Local MariaDB init, reset, seed, and ordered migration files
scripts/    Local PowerShell checks, migrations, and smoke tests
tests/      Native PHP tests without Composer or PHPUnit
e2e/        Playwright end-to-end browser test suites
docs/       Architecture, local development, and preserved frontend docs
```

## From Scratch Setup Guide

Follow this sequential step-by-step guide to set up, seed, and run DentiSys on a new local development environment.

### 1. System Prerequisites

Ensure the following prerequisites are installed on your system before proceeding:

- **Node.js**: v18.0.0 or higher (`node -v`)
- **PHP CLI**: v8.2.0 or higher with PDO and PDO_MySQL extensions enabled (`php -v`)
- **Database / Container Engine** (Choose one):
  - **Docker Desktop**: Recommended for containerized MariaDB and phpMyAdmin.
  - **XAMPP / Native MariaDB / MySQL**: Running on host port `3306`.

---

### 2. Step-by-Step Onboarding Commands

#### Step 1: Clone Repository & Setup Environment File

Copy the template environment file `.env.example` to `.env`:

- **Windows (PowerShell)**:
  ```powershell
  copy .env.example .env
  ```
- **macOS / Linux (Bash)**:
  ```bash
  cp .env.example .env
  ```

#### Step 2: Install Dependencies

Install root and frontend Node.js packages:

```bash
npm ci --prefix frontend
```

#### Step 3: Install Playwright Browsers (for E2E testing)

Install Chromium browser binaries for Playwright end-to-end testing:

```bash
npx playwright install chromium
```

---

### 3. Database Migration & Seeding Instructions

Pending migrations (`database/migrations/001_initial_schema.sql`, `002_user_roles.sql`, `003_system_audit.sql`) are automatically applied on startup by `start-dev.bat` or Docker initialization.

To manually seed demo users and initial data into the database:

- **Docker Mode**:
  ```bash
  docker compose exec -T db mysql -udentisys -plocal-development-password dentisys < database/seed.sql
  ```
- **XAMPP / Native MySQL (Windows PowerShell)**:
  ```powershell
  Get-Content database/seed.sql | mysql -u dentisys -p dentisys
  ```
- **Native MySQL (macOS / Linux Bash)**:
  ```bash
  mysql -u dentisys -p dentisys < database/seed.sql
  ```

---

### 4. Local Server Execution

Start the frontend and backend servers using your preferred environment mode:

#### Preferred Mode (Docker Desktop)

```bash
docker compose up -d
```

#### Native / XAMPP Mode

- **Windows (PowerShell / Batch)**:
  ```powershell
  .\start-dev.bat
  ```
  *(Or execute directly: `powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1`)*

- **macOS / Linux**:
  Start your native PHP built-in server and MySQL instance:
  ```bash
  php -S localhost:8090 -t backend/public
  npm run dev
  ```

---

### 5. Default Local URLs & Seeded Demo Credentials

#### Default Local URLs

| Service | Native / XAMPP URL | Docker URL | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | `http://localhost:5173` | `http://localhost:5173` | React / Vite Frontend App |
| **PHP API** | `http://localhost:8090` | `http://localhost:8080` | Backend API Server |
| **Health Check** | `http://localhost:8090/api/health` | `http://localhost:8080/api/health` | Backend Health Endpoint |
| **phpMyAdmin** | N/A (or XAMPP `/phpmyadmin`) | `http://localhost:8081` | Database Management GUI |
| **MariaDB** | `127.0.0.1:3306` | `127.0.0.1:3306` | Database Server |

#### Seeded Demo Login Credentials

The following demo accounts are available after applying `database/seed.sql`:

| Role | Email | Default Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@bicol-u.edu.ph` | *(Refer to seed.sql / dev setup)* | System Administrator |
| **Faculty** | `faculty@bicol-u.edu.ph` | *(Refer to seed.sql / dev setup)* | Faculty / Dentist Staff |
| **Secretary** | `secretary@bicol-u.edu.ph` | *(Refer to seed.sql / dev setup)* | Clinic Secretary |

---

### 6. Validation and Testing Commands

Run the full validation suite to verify compilation, test suites, and environment sanity:

```powershell
npm run build
npm run test:e2e
.\scripts\check.ps1
.\scripts\smoke.ps1
```

- `npm run build`: Validates TypeScript compilation and builds the Vite frontend production bundle.
- `npm run test:e2e`: Executes Playwright end-to-end browser test suites.
- `.\scripts\check.ps1`: Verifies local PHP version, database connection, and environment sanity.
- `.\scripts\smoke.ps1`: Executes backend API endpoint smoke tests.

---

## Development Environment Setup

DentiSys local development supports both Docker MariaDB (preferred) and a running XAMPP/native MySQL or MariaDB instance on host port `3306`.

### Preferred Mode (Docker MariaDB)
- **Host Address**: `127.0.0.1:3306`
- **Container Address**: `db:3306`
- **Credentials**: Process environment variables, root `.env`, or repository Docker defaults (`3306`, `dentisys`, `dentisys`, `local-development-password`).

### Native Fallback Mode (XAMPP / Native MySQL / MariaDB)
- **Host Address**: `127.0.0.1:3306`
- **Credentials**: Process `DB_*` environment variables, `backend/config/local.php`, or backend application defaults.
- **Zero-Touch Setup**: If the configured database does not exist on a reachable database server, it is automatically provisioned and migrated on startup with 0 PDO errors.
- **Pre-Existing Database Warning Policy**: If an existing database is detected, a clear warning banner is displayed. Pre-existing database objects are **never** automatically dropped or overwritten. If you want a clean install, please back up or drop the database manually.
- **Automatic Migrations**: Pending approved migrations (`001`–`003`) run automatically on startup for both Docker and Native paths. `database/seed.sql` is **never** executed automatically.

### No-Runtime Instructions
When neither Docker MariaDB nor a native MySQL/MariaDB server is available on port `3306`, start Docker Desktop (`docker compose up -d db`) or start XAMPP MySQL from the XAMPP Control Panel, then run `start-dev.bat` again.

```powershell
.\start-dev.bat
```

---

The existing frontend currently has pre-existing lint debt. Do not change frontend behavior just to satisfy lint unless a future task explicitly approves it.

Production deployment, registry publishing, TLS, VPS/cloud hosting, replicas, and CI/CD are outside this local foundation.
