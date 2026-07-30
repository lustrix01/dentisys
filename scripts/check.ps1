[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

& docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration is invalid.' }

$devServices = & docker compose config --services
if ($devServices -notcontains 'pgadmin') { throw 'Default development Compose must include pgAdmin.' }

$singleServerServices = & docker compose --env-file .env.single-server.example -f docker-compose.web.yml -f docker-compose.database.yml config --services
if ($singleServerServices -contains 'pgadmin' -or $singleServerServices -contains 'mailpit') {
    throw 'Single-server Compose must not include development-only services.'
}

$compose = Get-Content -LiteralPath (Join-Path $root 'docker-compose.yml') -Raw
if ($compose -match 'DB_HOST_PORT|xampp|XAMPP') { throw 'Docker Compose still contains a removed native-runtime reference.' }
if ($compose -notmatch 'postgres:18') { throw 'Docker Compose must use PostgreSQL 18.' }
if ($compose -match 'phpmyadmin|mariadb:') { throw 'Docker Compose contains a removed MariaDB/phpMyAdmin runtime reference.' }

$runtimeFiles = Get-ChildItem -Path backend,frontend -Recurse -File -Include *.php,*.ts,*.tsx
$obsolete = $runtimeFiles | Select-String -Pattern 'email_mfa|EMAIL_OTP_HMAC_KEY|XAMPP|xampp'
if ($obsolete) { throw "Removed runtime references remain in $($obsolete[0].Path)." }

$activeFiles = @(
    Get-ChildItem -Path backend,tests,e2e,frontend -Recurse -File |
        Where-Object { $_.FullName -notmatch '[\\/]vendor[\\/]|[\\/]node_modules[\\/]|[\\/]archive[\\/]|[\\/]test-results[\\/]|[\\/]dist[\\/]' }
)
$compatibilityPatterns = @(
    'lastInsertId', 'INSERT IGNORE', 'ON DUPLICATE KEY', 'LAST_INSERT_ID',
    'GROUP_CONCAT', 'JSON_SET', 'JSON_EXTRACT', 'JSON_UNQUOTE', 'IFNULL(',
    'DATE_ADD', 'DATEDIFF(', 'FIND_IN_SET', 'mysql:', '3306'
)
foreach ($pattern in $compatibilityPatterns) {
    $matches = $activeFiles | Select-String -SimpleMatch -Pattern $pattern
    if ($matches) { throw "PostgreSQL compatibility regression ($pattern): $($matches[0].Path):$($matches[0].LineNumber)" }
}
foreach ($file in $activeFiles) {
    $raw = Get-Content -LiteralPath $file.FullName -Raw
    if ($raw -match '(?is)UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s+JOIN\s+') {
        throw "MariaDB joined UPDATE remains active in $($file.FullName)."
    }
}

& docker compose run --rm --no-deps frontend npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

& docker compose run --rm --no-deps web sh -lc 'find /var/www/html/backend /var/www/html/tests/backend -name "*.php" -print0 | xargs -0 -n1 php -l'
if ($LASTEXITCODE -ne 0) { throw 'PHP syntax validation failed.' }

& docker compose run --rm --no-deps web sh -lc 'for test in /var/www/html/tests/backend/*_test.php; do php "$test" || exit 1; done'
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }

& npm run test:e2e
if ($LASTEXITCODE -ne 0) { throw 'Mocked UI E2E tests failed.' }

Write-Host 'PASS: Fast checks and mocked UI tests passed. Run .\scripts\check-postgres.ps1 for PostgreSQL integration/live validation.'
