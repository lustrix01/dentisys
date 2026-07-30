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

if ($NoBuild) {
    & docker compose up -d
} else {
    & docker compose up --build -d
}
if ($LASTEXITCODE -ne 0) { throw 'The development stack failed to start.' }

& (Join-Path $PSScriptRoot 'migrate.ps1')
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL migrations failed.' }

Write-Host 'DentiSys development environment is ready.'
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'API health: http://localhost:8080/api/health'
Write-Host 'Mailpit: http://localhost:8025'
Write-Host 'pgAdmin: http://127.0.0.1:5050'
Write-Host 'Existing database data was preserved. To add demo data manually, paste database/seeds/development-demo.sql into pgAdmin Query Tool.'
