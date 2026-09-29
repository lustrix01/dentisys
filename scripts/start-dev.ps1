[CmdletBinding()]
param(
    [switch] $NoBuild
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
    throw 'Missing .env. Copy .env.example to .env before starting DentiSys.'
}

& docker compose up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'The PostgreSQL service failed to become ready.' }

& (Join-Path $PSScriptRoot 'migrate.ps1')
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL migrations failed.' }

if ($NoBuild) {
    & docker compose up -d
} else {
    & docker compose up --build -d
}
if ($LASTEXITCODE -ne 0) { throw 'The development stack failed to start.' }

Write-Host 'DentiSys development environment is ready.'
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'API health: http://localhost:8080/api/health'
Write-Host 'Mailpit: http://localhost:8025'
Write-Host 'pgAdmin: http://127.0.0.1:5050'
Write-Host 'Existing database data was preserved. To add demo data manually, paste database/seeds/development-demo.sql into pgAdmin Query Tool.'
# Every class needs grade weights; give any class offering without them a starting configuration.
& docker compose exec -T web php /var/www/html/backend/bin/bootstrap-grade-weights.php
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Grade-weight bootstrap did not finish. Run: docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php'
}
# REG-010: with no Dean account yet, invite the first Dean named in .env (FIRST_DEAN_*).
& docker compose exec -T web php /var/www/html/backend/bin/bootstrap-first-dean.php
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'First Dean invitation did not finish. Check FIRST_DEAN_* in .env, then run: docker compose exec web php /var/www/html/backend/bin/bootstrap-first-dean.php'
}
# BIO-005: delete biometric references whose semester ended or whose Student is no longer active.
& docker compose exec -T web php /var/www/html/backend/bin/expire-biometrics.php
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Biometric expiry sweep did not finish. Run: docker compose exec web php /var/www/html/backend/bin/expire-biometrics.php'
}
