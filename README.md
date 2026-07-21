# DentiSys

DentiSys is being organized as a local full-stack repository with a preserved React/Vite frontend and a minimal plain-PHP API foundation. Business APIs and the DentiSys domain database schema are not implemented yet.

## Project Map

```text
frontend/   Existing React 19, TypeScript, Vite, TailwindCSS app
backend/    Plain PHP API foundation served from backend/public
database/   Local MariaDB init and ordered migration files
scripts/    Local PowerShell checks, migrations, and smoke tests
tests/      Native PHP tests without Composer or PHPUnit
docs/       Architecture, local development, and preserved frontend docs
```

## Frontend Quick Start

```powershell
npm ci --prefix frontend
npm run dev
```

The forwarded root scripts are:

```powershell
npm run lint
npm run build
npm run preview
```

## Docker Quick Start

Copy `.env.example` to `.env` for local Docker values, then run:

```powershell
docker compose up --build
```

Default local URLs:

- Frontend: `http://localhost:5173`
- PHP API: `http://localhost:8080`
- Health route: `http://localhost:8080/api/health`
- Direct health: `http://localhost:8080/healthcheck.php`
- phpMyAdmin: `http://localhost:8081`
- MariaDB host access: `127.0.0.1:3306`

## Development Environment Setup

DentiSys local development supports both Docker MariaDB (preferred) and a running XAMPP/native MySQL or MariaDB instance on host port `3306`.

### Preferred Mode (Docker MariaDB)
- **Host Address**: `127.0.0.1:3306`
- **Container Address**: `db:3306`
- **Credentials**: Process environment variables, root `.env`, or repository Docker defaults (`3306`, `dentisys`, `dentisys`, `local-development-password`).

### Native Fallback Mode (XAMPP / Native MySQL / MariaDB)
- **Host Address**: `127.0.0.1:3306`
- **Credentials**: Process `DB_*` environment variables, `backend/config/local.php`, or backend application defaults.
- **Database Requirement**: The `dentisys` database must already exist on the native server with user access granted.
- **Automatic Migrations**: Pending approved migrations (`001`–`003`) run automatically on startup for both Docker and Native paths. `database/seed.sql` is **never** executed automatically.

### No-Runtime Instructions
When neither Docker MariaDB nor a native MySQL/MariaDB server is available on port `3306`, start Docker Desktop (`docker compose up -d db`) or start XAMPP MySQL from the XAMPP Control Panel, then run `start-dev.bat` again.

```powershell
.\start-dev.bat
```

## Validation

```powershell
npm run build
.\scripts\check.ps1
.\scripts\smoke.ps1
```

The existing frontend currently has pre-existing lint debt. Do not change frontend behavior just to satisfy lint unless a future task explicitly approves it.

Production deployment, registry publishing, TLS, VPS/cloud hosting, replicas, and CI/CD are outside this local foundation.
