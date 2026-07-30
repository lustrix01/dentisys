# Archived MariaDB Migrations

> Historical reference only. These files are not part of the PostgreSQL runtime. Use `database/migrations/` for active DentiSys migrations.

# Database Migrations

## Active baseline (clean-install only)

Place ordered local schema migrations here using names like:

```text
001_baseline_schema.sql
002_seed_rbac.sql
003_seed_system_settings.sql
```

These three files create the 15-application-table DentiSys Phase 2 baseline:

- 001: All 15 domain tables (user_accounts through system_settings), indexes, foreign keys, unique constraints, and immutability triggers.
- 002: Static RBAC seed — 125 role_permission grants across admin, faculty, and secretary roles.
- 003: Static system_settings seed — 5 reserved rows (audit_chain_head, retention_policy, grading_defaults, rate_limit_defaults, devices).
- 004: Idempotent corrective repair for deterministic seed identities, fake integration/history fixtures, and the audit-chain reset guard.

The new baseline is clean-install only. If the database contains any legacy migration records, legacy business tables, or pre-existing target tables from an unrecognised source, the migration runner will abort with an error.

## Archived legacy migrations

The 80 Phase 1A/1B/1C migration files have been moved to `database/migrations/archive/`. They are preserved for historical reference and are not executable by the current migration runner.
