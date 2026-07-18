# DentiSys — Backend API

PHP backend for the DentiSys Dental Academic Management System (BU-CDM).

## Table of Contents
1. [System Overview](#system-overview)
2. [Current Backend Files](#current-backend-files)
3. [Run with Docker](#run-with-docker)
4. [Run with XAMPP](#run-with-xampp)
5. [Current Endpoints](#current-endpoints)
6. [Environment Variables](#environment-variables)

### System Overview

This is the PHP-based REST API backend for DentiSys, using PDO to connect to a MariaDB database. The project is currently in the **infrastructure skeleton** phase — the Docker/XAMPP stack is running and the database connection works, but no API controllers, models, or business logic have been implemented yet.

### Current Backend Files

- **`index.php` (Front Controller):**
  - Sets CORS headers (`Access-Control-Allow-Origin: *`), `Content-Type: application/json`.
  - Handles `OPTIONS` preflight requests (returns 204).
  - Default response: `{"status":"ok","message":"DentiSys API"}`.

- **`.htaccess` (Apache Rewrite Rules):**
  - Enables `RewriteEngine` and routes all non-file, non-directory requests to `index.php`.

- **`db.php` (Database Connection):**
  - PDO MySQL connection using `getenv()` with XAMPP-friendly fallback defaults.
  - On failure, returns HTTP 500 with a JSON error body.
  - Charset set to `utf8mb4`.

- **`healthcheck.php` (Health Check):**
  - Standalone endpoint that tests database connectivity via `SELECT 1`.
  - Returns `{"status":"ok","database":"connected"}` on success.

- **`database/schema.sql` (Database Schema):**
  - Initial schema with a `users` table (`id`, `username`, `password`, `created_at`).
  - Auto-imported by Docker on first run via `/docker-entrypoint-initdb.d`.

- **`config/` (Placeholder):**
  - Empty directory reserved for future backend configuration files.

### Run with Docker

1. The `.env` file at the project root is pre-configured with development defaults. Adjust credentials if needed.
2. From the project root, run:
   ```bash
   docker compose up --build
   ```
3. Open:
   - API base: `http://localhost:8080`
   - Healthcheck: `http://localhost:8080/healthcheck.php`
   - phpMyAdmin: `http://localhost:8081` (login: `root` / `rootpassword`)

The database is initialized automatically from `backend/database/schema.sql`.

### Run with XAMPP

1. Start **Apache** and **MySQL** in XAMPP.
2. Place this project in `xampp/htdocs/`.
3. Import `backend/database/schema.sql` into a database named `dentisys` via phpMyAdmin.
4. Use the API at:
   - `http://localhost/dentisys/backend/`
   - `http://localhost/dentisys/backend/healthcheck.php`

`backend/db.php` fallback defaults for XAMPP local mode:

| Variable | Default |
|---|---|
| `DB_HOST` | `127.0.0.1` |
| `DB_USER` | `root` |
| `DB_PASS` | *(empty)* |
| `DB_NAME` | `dentisys` |
| `DB_PORT` | `3306` |

### Current Endpoints

| Method | Path | Response |
|---|---|---|
| `GET` | `/` | `{"status":"ok","message":"DentiSys API"}` |
| `GET` | `/healthcheck.php` | `{"status":"ok","database":"connected"}` |

### Environment Variables

| Variable | Description |
|---|---|
| `MYSQL_ROOT_PASSWORD` | MariaDB root password (Docker only) |
| `MYSQL_DATABASE` | Database name (default: `dentisys`) |
| `MYSQL_USER` | Application database user |
| `MYSQL_PASSWORD` | Application database password |
