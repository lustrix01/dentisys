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

Docker MariaDB is the sole DentiSys development database.

Stop XAMPP MySQL before starting DentiSys because Docker uses host port 3306.
XAMPP PHP may still be used to run the PHP development server.

Host PHP connects to `127.0.0.1:3306`.
Docker services connect to `db:3306`.

The root `.env` defines the Docker database credentials.
The repository launcher (`start-dev.bat` / `scripts/start-dev.ps1`) passes those same credentials to the host PHP backend without printing them.

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
