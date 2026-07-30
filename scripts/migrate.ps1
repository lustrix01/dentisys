[CmdletBinding()]
param(
    [string] $DatabaseName = $env:DB_NAME,
    [string] $AdminUser = $env:DB_ADMIN_USER,
    [string] $AdminPassword = $env:DB_ADMIN_PASS
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

if ([string]::IsNullOrWhiteSpace($DatabaseName)) { $DatabaseName = 'dentisys' }
if ([string]::IsNullOrWhiteSpace($AdminUser)) { $AdminUser = 'postgres' }
if ([string]::IsNullOrWhiteSpace($AdminPassword)) { $AdminPassword = 'local-postgres-admin-password' }

& docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration is invalid.' }

$dbId = (& docker compose ps -q db).Trim()
if ([string]::IsNullOrWhiteSpace($dbId)) { throw 'PostgreSQL is not running. Start it with: docker compose up -d db' }

$migrations = Get-ChildItem -LiteralPath (Join-Path $root 'database\migrations') -File -Filter '*.sql' | Sort-Object Name
foreach ($migration in $migrations) {
    $name = $migration.Name
    $exists = (& docker compose exec -T -e "PGPASSWORD=$AdminPassword" db psql -U $AdminUser -d $DatabaseName -qtAX -c "SELECT COUNT(*) FROM _schema_migrations WHERE version = '$name';").Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to query migration state for $name." }
    if ($exists -eq '1') { Write-Host "SKIP: $name"; continue }

    Write-Host "APPLY: $name"
    & docker compose exec -T -e "PGPASSWORD=$AdminPassword" db psql -v ON_ERROR_STOP=1 --single-transaction -U $AdminUser -d $DatabaseName -f "/postgres/migrations/$name" -c "INSERT INTO _schema_migrations (version) VALUES ('$name');"
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $name" }
}

Write-Host 'PASS: PostgreSQL migrations are current.'
