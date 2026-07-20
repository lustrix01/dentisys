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
- MariaDB host access: `127.0.0.1:3307`

## XAMPP Quick Start

Place the repository at `C:\xampp\htdocs\dentisys`, enable Apache `mod_rewrite`, PHP `pdo`, and `pdo_mysql`, then copy `backend/config/local.example.php` to ignored `backend/config/local.php`.

- API: `http://localhost/dentisys/backend/public/api/health`
- Direct health: `http://localhost/dentisys/backend/public/healthcheck.php`
- DB defaults: `DB_HOST=127.0.0.1`, `DB_PORT=3306`

## Hybrid Quick Start

Use XAMPP Apache/PHP with Docker MariaDB:

```powershell
docker compose up -d db phpmyadmin
```

Set XAMPP PHP local config to:

```text
DB_HOST=127.0.0.1
DB_PORT=3307
```

If `3307` is occupied, change both `DB_HOST_PORT` in `.env` and `DB_PORT` in `backend/config/local.php` to the same available host port.

## Validation

```powershell
npm run build
.\scripts\check.ps1
.\scripts\smoke.ps1
```

The existing frontend currently has pre-existing lint debt. Do not change frontend behavior just to satisfy lint unless a future task explicitly approves it.

Production deployment, registry publishing, TLS, VPS/cloud hosting, replicas, and CI/CD are outside this local foundation.
