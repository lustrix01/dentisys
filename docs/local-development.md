# Local Development

## Runtime Matrix

| Mode | PHP runtime | Database runtime | API URL | DB host from PHP | DB port from PHP | Command |
|---|---|---|---|---|---:|---|
| Host Dev (Docker DB) | Host PHP / XAMPP PHP | Docker MariaDB | `http://localhost:8090/api/health` | `127.0.0.1` | `3306` | `.\start-dev.bat` |
| Host Dev (Native DB) | Host PHP / XAMPP PHP | XAMPP / Native MySQL | `http://localhost:8090/api/health` | `127.0.0.1` | `3306` | `.\start-dev.bat` |
| Full Docker | Docker Apache/PHP | Docker MariaDB | `http://localhost:8080/api/health` | `db` | `3306` | `docker compose up --build` |

## Host Development Setup

DentiSys local development supports both Docker MariaDB (preferred) and a running XAMPP/native MySQL or MariaDB instance on host port `3306`.

### Docker Mode (Preferred)
- **Host Address**: `127.0.0.1:3306`
- **Container Address**: `db:3306`
- **Credentials**: Process environment variables, root `.env`, or repository Docker defaults (`3306`, `dentisys`, `dentisys`, `local-development-password`).

### Native Fallback Mode (XAMPP / Native MySQL / MariaDB)
- **Host Address**: `127.0.0.1:3306`
- **Credentials**: Process `DB_*` environment variables, `backend/config/local.php`, or backend application defaults.
- **Database Requirement**: The `dentisys` database must already exist on the native server with user access granted.
- **Automatic Migrations**: Pending approved migrations (`001`–`003`) run automatically on startup for both Docker and Native paths. `database/seed.sql` is **never** executed automatically.

### No-Runtime Handling
When neither Docker MariaDB nor a native MySQL/MariaDB server is available on port `3306`, the launcher stops safely and instructs the developer to start Docker Desktop (`docker compose up -d db`) or start XAMPP MySQL from the XAMPP Control Panel before re-running `start-dev.bat`.

Default endpoints:

- Frontend: `http://localhost:5173`
- PHP API: `http://localhost:8090` (when using launcher) or `http://localhost:8080` (when using full Docker)
- Health route: `http://localhost:8090/api/health`
- Direct health: `http://localhost:8090/healthcheck.php`
- phpMyAdmin: `http://localhost:8081`
- MariaDB host access: `127.0.0.1:3306`

Inside Docker, the PHP container uses `DB_HOST=db` and `DB_PORT=3306`.

## Database Initialization and Migrations

Docker runs `database/init.sql` only when the MariaDB data volume is created for the first time. It creates only `_schema_migrations`.

Run ordered migrations with:

```powershell
.\scripts\migrate.ps1
```

Do not run `docker compose down -v` unless local database data loss is explicitly approved.

## Smoke Checks

With Docker services running:

```powershell
.\scripts\smoke.ps1 -CheckPhpMyAdmin
```

For XAMPP or hybrid mode:

```powershell
.\scripts\smoke.ps1 -BackendUrl "http://localhost/dentisys/backend/public"
```
