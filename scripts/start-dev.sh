#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==================================================="
echo "          Starting DentiSys Local Environment"
echo "==================================================="
echo ""

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-${DB_HOST_PORT:-3306}}"
DB_NAME="${DB_NAME:-dentisys}"
DB_USER="${DB_USER:-dentisys}"
DB_PASS="${DB_PASS:-local-development-password}"

MYSQL_CMD=""
if command -v mariadb >/dev/null 2>&1; then
    MYSQL_CMD="mariadb"
elif command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mysql"
fi

if [ -n "$MYSQL_CMD" ]; then
    export MYSQL_PWD="$DB_PASS"
    if "$MYSQL_CMD" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT 1;" >/dev/null 2>&1; then
        DB_EXISTS=$("$MYSQL_CMD" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --batch --skip-column-names -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DB_NAME';" 2>/dev/null || true)
        if [ "$DB_EXISTS" = "$DB_NAME" ]; then
            TABLE_COUNT=$("$MYSQL_CMD" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='user_accounts';" 2>/dev/null || echo "0")
            if [ "$TABLE_COUNT" -gt 0 ]; then
                echo "Database '$DB_NAME' is ready and up to date."
            else
                echo "======================================================================"
                echo " WARNING: Existing database '$DB_NAME' detected."
                echo " Pre-existing database objects will NOT be dropped or overwritten."
                echo " If you want a clean install, please back up or drop manually."
                echo "======================================================================"
            fi
        else
            echo "Database '$DB_NAME' does not exist on $DB_HOST:$DB_PORT. Provisioning database..."
            if "$MYSQL_CMD" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
                echo "PASS: Automatically provisioned database '$DB_NAME'."
            else
                echo "WARNING: Failed to auto-create database '$DB_NAME'."
            fi
        fi
    else
        echo "WARNING: Could not connect to database server at $DB_HOST:$DB_PORT."
    fi
    unset MYSQL_PWD
else
    echo "WARNING: No mysql or mariadb client found in PATH. Proceeding in offline mode."
fi

echo "Starting PHP Backend API on http://localhost:8090 ..."
php -S localhost:8090 -t backend/public &
PHP_PID=$!

echo "Starting Frontend Dev Server on http://localhost:5173 ..."
npm run dev
