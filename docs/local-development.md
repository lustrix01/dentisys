# Local Development

## Runtime Matrix

| Mode | PHP runtime | Database runtime | API URL | DB host from PHP | DB port from PHP | Command |
|---|---|---|---|---|---:|---|
| Host Development | Host PHP / XAMPP PHP | Docker MariaDB | `http://localhost:8090/api/health` | `127.0.0.1` | `3306` | `.\start-dev.bat` |
| Full Docker | Docker Apache/PHP | Docker MariaDB | `http://localhost:8080/api/health` | `db` | `3306` | `docker compose up --build` |

## Host Development Setup

Docker MariaDB is the sole DentiSys development database.

Stop XAMPP MySQL before starting DentiSys because Docker uses host port 3306.
XAMPP PHP may still be used to run the PHP development server.

Host PHP connects to `127.0.0.1:3306`.
Docker services connect to `db:3306`.

The root `.env` defines the Docker database credentials.
The repository launcher (`start-dev.bat` / `scripts/start-dev.ps1`) passes those same credentials to the host PHP backend without printing them.

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
