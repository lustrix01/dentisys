# Local Development

## Runtime Matrix

| Mode | PHP runtime | Database runtime | API URL | DB host from PHP | DB port from PHP | Command |
|---|---|---|---|---|---:|---|
| Full Docker | Docker Apache/PHP | Docker MariaDB | `http://localhost:8080/api/health` | `db` | `3306` | `docker compose up --build` |
| Full XAMPP | XAMPP Apache/PHP | XAMPP MySQL or MariaDB | `http://localhost/dentisys/backend/public/api/health` | `127.0.0.1` | `3306` | Start XAMPP Apache and MySQL |
| Hybrid | XAMPP Apache/PHP | Docker MariaDB | `http://localhost/dentisys/backend/public/api/health` | `127.0.0.1` | `3307` | `docker compose up -d db phpmyadmin` |

## Full Docker

Create a local `.env` from `.env.example` when custom local values are needed. Do not commit `.env`.

```powershell
docker compose up --build
```

Default endpoints:

- Frontend: `http://localhost:5173`
- PHP API: `http://localhost:8080`
- Health route: `http://localhost:8080/api/health`
- Direct health: `http://localhost:8080/healthcheck.php`
- phpMyAdmin: `http://localhost:8081`
- MariaDB host access: `127.0.0.1:3307`

Inside Docker, the PHP container uses `DB_HOST=db` and `DB_PORT=3306`.

## Full XAMPP

Place the repository at:

```text
C:\xampp\htdocs\dentisys
```

Copy `backend/config/local.example.php` to ignored `backend/config/local.php` and adjust local-only values.

Expected URLs:

- API: `http://localhost/dentisys/backend/public/api/health`
- Direct health: `http://localhost/dentisys/backend/public/healthcheck.php`
- phpMyAdmin: `http://localhost/phpmyadmin`

Expected DB settings:

```text
DB_HOST=127.0.0.1
DB_PORT=3306
```

Required XAMPP capabilities:

- Apache `mod_rewrite`
- Apache override configuration that permits `.htaccess`
- PHP `pdo`
- PHP `pdo_mysql`

Optional VirtualHost configuration may point directly at `backend/public`, but it is not required.

## Hybrid XAMPP Apache/PHP + Docker MariaDB

Run only the database utility services:

```powershell
docker compose up -d db phpmyadmin
```

Set `backend/config/local.php` for XAMPP PHP:

```text
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=dentisys
DB_USER=dentisys
DB_PASS=local-development-password
```

The `DB_PORT` value must match `DB_HOST_PORT` in Docker Compose. The default `3307` avoids collision with XAMPP MySQL on `3306`. If `3307` is occupied, change both values to the same available host port.

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
