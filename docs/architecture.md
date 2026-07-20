# DentiSys Architecture

DentiSys now separates the existing frontend from a small plain-PHP API foundation. The current React app remains mock-data driven and is not wired to backend APIs yet.

## Frontend

`frontend/` contains the existing React 19, TypeScript, Vite, React Router, TailwindCSS, and ESLint application. Its routes, pages, assets, localStorage keys, mock users, and mock workflows are preserved.

Future API integration should use a `VITE_API_BASE_URL` convention, but this foundation does not add frontend API calls or environment files.

## Backend

Apache serves `backend/public` as the document root.

- `backend/public/index.php` is the routed API entry point.
- `backend/public/healthcheck.php` is a direct health endpoint that works without rewrite support.
- `backend/app/config.php` reads process/server environment variables, then ignored local PHP config, then local defaults.
- `backend/app/database.php` centralizes MariaDB PDO DSN construction and options.
- `backend/app/request.php`, `response.php`, `router.php`, and `security.php` provide minimal framework-free helpers.
- `backend/controllers/HealthController.php` owns the shared health-check behavior.
- `backend/routes/api.php` maps `GET /api/health`.

The backend deliberately does not implement authentication, authorization, CORS, CSRF enforcement, DentiSys CRUD endpoints, or business validation.

## Request Flow

`GET /api/health` is rewritten to `backend/public/index.php`, which loads bootstrap, routes the request, and calls the health controller. `GET /healthcheck.php` loads the same bootstrap and controller directly.

The health controller confirms PHP initialization and attempts `SELECT 1` through the centralized PDO factory. It returns safe JSON without credentials, DSNs, stack traces, or detailed database exceptions.

## Database

`database/init.sql` is for fresh local MariaDB volumes and creates only `_schema_migrations`. Business tables are intentionally absent.

`database/migrations/` stores ordered SQL files named like `001_description.sql`. `scripts/migrate.ps1` applies unapplied migrations and records successful filenames in `_schema_migrations`.

MariaDB entrypoint initialization runs only when Docker creates the database volume for the first time. Do not delete volumes unless local data loss is explicitly approved.

## Excluded Concerns

This foundation excludes production deployment automation, production Compose files, registry publishing, Traefik, Watchtower, TLS certificates, VPS/cloud provisioning, replicas, CI/CD, and production-specific documentation.
