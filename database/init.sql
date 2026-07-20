-- DentiSys local database initialization.
-- MariaDB runs files in docker-entrypoint-initdb.d only when the data volume is first created.
-- Future schema changes belong in ordered files under database/migrations/.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS _schema_migrations (
    version VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
