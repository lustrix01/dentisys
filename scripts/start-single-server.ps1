[CmdletBinding()]
param(
    [string]$EnvFile = '.env.single-server'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
$envPath = Join-Path $root $EnvFile
if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Single-server environment file not found: $envPath. Copy .env.single-server.example first."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

foreach ($key in @('APP_BASE_URL', 'DB_PASS', 'DB_ADMIN_PASS', 'JWT_SIGNING_KEY_B64', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64', 'SMTP_HOST', 'SMTP_FROM')) {
    $value = $values[$key]
    if ([string]::IsNullOrWhiteSpace($value) -or $value -like 'replace_with_*') {
        throw "Set $key in the single-server environment before starting."
    }
}

$appBaseUri = $null
if (-not [Uri]::TryCreate($values['APP_BASE_URL'], [UriKind]::Absolute, [ref]$appBaseUri) -or $appBaseUri.Scheme -notin @('http', 'https')) {
    throw 'APP_BASE_URL must be a valid absolute HTTP(S) URL.'
}

& docker compose --env-file $envPath -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Single-server Compose configuration is invalid.' }
& docker compose --env-file $envPath -p dentisys-single-server -f docker-compose.web.yml -f docker-compose.database.yml up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Single-server stack failed to start.' }
Write-Host 'Single-server stack started. PostgreSQL remains internal; access the application on APP_HTTP_PORT.'
