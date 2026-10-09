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

# EML-001: CUSTOM e-mail mode also runs Mailpit.
$composeArgs = @('--env-file', $envPath, '-p', 'dentisys-single-server', '-f', 'docker-compose.web.yml', '-f', 'docker-compose.database.yml')
if ($values['EMAIL_PROVIDER'] -eq 'custom') {
    $composeArgs += @('--profile', 'mailpit')
}

& docker compose @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Single-server Compose configuration is invalid.' }

# Migrations: a new database applies them on creation; an existing one is
# backed up first when migrations are pending, then brought up to date.
& docker compose @composeArgs up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'The PostgreSQL service failed to become ready.' }
$dbName = if ($values['DB_NAME']) { $values['DB_NAME'] } else { 'dentisys' }
$adminUser = if ($values['DB_ADMIN_USER']) { $values['DB_ADMIN_USER'] } else { 'postgres' }
# First-time creation runs on a socket-only server; TCP answers once it is done.
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        & docker compose @composeArgs exec -T db pg_isready -h 127.0.0.1 -U $adminUser -d $dbName *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'PostgreSQL did not finish starting.' }
$applied = @(& docker compose @composeArgs exec -T db psql -U $adminUser -d $dbName -qtAX -c 'SELECT version FROM _schema_migrations')
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the applied migrations.' }
$pending = @(Get-ChildItem -LiteralPath (Join-Path $root 'database\migrations') -File -Filter '*.sql' | Where-Object { $applied -notcontains $_.Name })
if ($pending.Count -gt 0) {
    $backupDir = Join-Path $root 'backups'
    New-Item -ItemType Directory -Force $backupDir | Out-Null
    $backupName = "single-server-before-migrate-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
    # mktemp protects database contents inside the Linux container before writing.
    $backupTemp = (& docker compose @composeArgs exec -T db mktemp /tmp/dentisys-backup.XXXXXX | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($backupTemp)) { throw 'Unable to create a private backup file; nothing was migrated.' }
    & docker compose @composeArgs exec -T db pg_dump -U $adminUser -d $dbName -Fc -f $backupTemp
    if ($LASTEXITCODE -ne 0) { throw 'The pre-migration backup failed; nothing was migrated.' }
    & docker compose @composeArgs cp "db:$backupTemp" (Join-Path $backupDir $backupName)
    if ($LASTEXITCODE -ne 0) { throw 'The pre-migration backup could not be copied; nothing was migrated.' }
    & docker compose @composeArgs exec -T db rm -f $backupTemp
    Write-Host "Backup before $($pending.Count) pending migration(s): backups\$backupName"
    & docker compose @composeArgs exec -T db sh /docker-entrypoint-initdb.d/001-migrations.sh
    if ($LASTEXITCODE -ne 0) { throw "Migrations failed. Restore from backups\$backupName if needed." }
}

& docker compose @composeArgs up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Single-server stack failed to start.' }

# Same maintenance as start-dev.ps1. A failure is reported but does not stop the stack.
foreach ($task in @(
    @{ Script = 'bootstrap-grade-weights.php'; Label = 'Grade-weight setup' },
    @{ Script = 'bootstrap-first-dean.php'; Label = 'First Dean invitation (check FIRST_DEAN_*)' },
    @{ Script = 'expire-biometrics.php'; Label = 'Biometric expiry sweep' }
)) {
    & docker compose @composeArgs exec -T -u www-data web php "/var/www/html/backend/bin/$($task.Script)"
    if ($LASTEXITCODE -ne 0) { Write-Warning "$($task.Label) did not finish." }
}
Write-Host 'Single-server stack started. PostgreSQL remains internal; access the application on APP_HTTP_PORT.'
