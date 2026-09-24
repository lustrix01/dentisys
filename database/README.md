# DentiSys PostgreSQL Database

This directory is the single source of truth for the DentiSys PostgreSQL schema. Docker initializes a new database with `init.sql`, then runs every ordered migration in `migrations/`.

```text
database/
├── README.md                 This guide
├── init.sql                  Creates the migration ledger
├── apply-migrations.sh       Creates the application role and applies migrations
├── pgadmin-servers.json      Development pgAdmin connection definition
├── migrations/               Ordered PostgreSQL schema and reference-data changes
    ├── 001_baseline_schema.sql
    ├── 002_seed_rbac.sql
    ├── 003_seed_system_settings.sql
    ├── 004_postgresql_runtime_compatibility.sql
    └── 005_student_identity_authentication.sql
├── seeds/                    Manual development-only data imports
│   └── development-demo.sql
└── archive/mariadb/          Superseded MariaDB files; not used at runtime
```

## Migration rules

Current planned work follows [UI migration and 3NF plan](../docs/ui-migration-plan.md) and spec.md ID-002: copy the UI first, then audit its field/entity dependencies and normalize affected data. Five-part names and other composite inputs require explicit mappings, additive migrations, safe backfills, and compatibility handling. Existing structured-name migrations must be inspected and reused. No schema changes or full-3NF claim are made by this documentation update.

- Add a new, ordered `NNN_description.sql` file for every schema or reference-data change.
- Never edit a migration that has been applied to a shared environment; create a follow-up migration instead.
- Run `.\scripts\migrate.ps1` after pulling new migrations into an existing development database.
- Fresh PostgreSQL volumes apply all migrations automatically.
- Run `.\scripts\check-postgres.ps1` for the disposable PostgreSQL integration stack and live checks. It imports the manual demo seed twice to verify unchanged counts, usable accounts, and aligned sequences, then removes only its separate project and volume; development data is never reset.

The legacy MariaDB schema, reset scripts, demo seed, and historical migration chain are preserved under `archive/mariadb/`. They are not supported by the current runtime.

## Development demo data

`seeds/development-demo.sql` contains the demo users, courses, classes, students, grades, and attendance records. It is intentionally not a migration and is never run automatically.

To load it, start the development stack, open pgAdmin's **Query Tool** for the `dentisys` database, paste the complete file, and execute it. The PostgreSQL script is non-destructive: it does not drop, truncate, or alter the schema, and existing duplicate rows are skipped.
