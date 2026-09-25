[CmdletBinding()]
param(
    [switch] $KeepStack,
    [ValidatePattern('^dentisys-[a-z0-9-]+$')]
    [string] $ComposeProject = 'dentisys-integration',
    [int] $BackendHttpPort = 18080,
    [int] $FrontendHttpPort = 15173,
    [int] $MailpitUiPort = 18025
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$project = $ComposeProject
$backendBaseUrl = "http://127.0.0.1:$BackendHttpPort"
$frontendBaseUrl = "http://127.0.0.1:$FrontendHttpPort"
$composeFiles = @('-p', $project, '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml')
$expectedMigrations = @(Get-ChildItem -LiteralPath (Join-Path $root 'database\migrations') -File -Filter '*.sql' | Sort-Object Name | ForEach-Object Name)
if ($expectedMigrations.Count -eq 0) { throw 'No active PostgreSQL migrations were found.' }
$env:DB_ADMIN_USER = 'postgres'
$env:DB_ADMIN_PASS = 'integration-postgres-admin'
$env:DB_NAME = 'dentisys'
$env:DB_USER = 'dentisys'
$env:DB_PASS = 'integration-development-password'
$env:BACKEND_HTTP_PORT = [string] $BackendHttpPort
$env:FRONTEND_HTTP_PORT = [string] $FrontendHttpPort
$env:MAILPIT_UI_PORT = [string] $MailpitUiPort
$env:JWT_SIGNING_KEY_B64 = 'SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko='
$env:MFA_ENCRYPTION_KEY_B64 = 'RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU='
$env:AUDIT_MAC_KEY_B64 = 'TU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU0='
$env:STUDENT_AUTH_ENABLED = 'true'
# Keep the disposable browser gate deterministic and offline. Real Google
# provider acceptance is intentionally a separate manual/provider check.
$env:GOOGLE_CLIENT_ID = ''

function Invoke-Compose {
    param([string[]] $Arguments)
    & docker compose @composeFiles @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose command failed: $($Arguments -join ' ')" }
}

function Invoke-PsqlScalar {
    param([string] $Query)
    $output = & docker compose @composeFiles exec -T db psql -U postgres -d dentisys -Atc $Query
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL query failed: $Query" }
    return ($output | Out-String).Trim()
}

function Invoke-PsqlScalarDatabase {
    param([string] $Database, [string] $Query)
    $output = & docker compose @composeFiles exec -T db psql -U postgres -d $Database -Atc $Query
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL query failed for database ${Database}: $Query" }
    return ($output | Out-String).Trim()
}

function Get-AppliedMigrations {
    $versions = Invoke-PsqlScalar 'SELECT version FROM _schema_migrations ORDER BY version;'
    return @($versions -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Assert-MigrationLedgerMatchesActiveFiles {
    param([string[]] $Applied, [string] $Context)

    $difference = @(Compare-Object -ReferenceObject $expectedMigrations -DifferenceObject $Applied)
    if ($difference.Count -ne 0) {
        throw "Migration ledger does not match active migration files $Context. Expected [$($expectedMigrations -join ', ')], found [$($Applied -join ', ')]."
    }
}

try {
    Invoke-Compose @('down', '-v', '--remove-orphans')
    Invoke-Compose @('up', '--build', '-d')

    $healthy = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $status = (& docker compose @composeFiles ps --format json | ConvertFrom-Json)
        $db = @($status | Where-Object { $_.Service -eq 'db' }) | Select-Object -First 1
        $web = @($status | Where-Object { $_.Service -eq 'web' }) | Select-Object -First 1
        if ($db -and $web -and $db.Health -eq 'healthy' -and $web.Health -eq 'healthy') { $healthy = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $healthy) { throw 'Integration PostgreSQL/web services did not become healthy.' }

    # The frontend has no Compose healthcheck because Vite's development
    # server is the test surface. Wait for the actual HTTP entrypoint before
    # launching live Playwright so a cold-start race cannot invalidate the
    # entire browser gate.
    $frontendReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $frontendReady = $true
            foreach ($warmupUri in @(
                "$frontendBaseUrl/",
                "$frontendBaseUrl/@vite/client"
            )) {
                $frontendResponse = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $warmupUri
                if ($frontendResponse.StatusCode -ne 200) { $frontendReady = $false; break }
            }
            if ($frontendReady) {
                $mainResponse = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$frontendBaseUrl/src/main.tsx"
                if ($mainResponse.StatusCode -ne 200) { $frontendReady = $false }
                $dependencyUris = [regex]::Matches(
                    [string] $mainResponse.Content,
                    '/node_modules/\.vite/deps/[^"'' ]+'
                ) | ForEach-Object Value | Select-Object -Unique
                foreach ($dependencyUri in $dependencyUris) {
                    $dependencyResponse = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri ("$frontendBaseUrl$dependencyUri")
                    if ($dependencyResponse.StatusCode -ne 200) { $frontendReady = $false; break }
                }
            }
            if ($frontendReady) { break }
        } catch { $frontendReady = $false }
        Start-Sleep -Seconds 2
    }
    if (-not $frontendReady) { throw 'Integration frontend did not become ready.' }

    # Exercise the public runtime-config contract over HTTP, including the
    # cache-safety headers and method guard. This runs against the disposable
    # integration web service only.
    $runtimeResponse = Invoke-WebRequest -UseBasicParsing -Uri "$backendBaseUrl/api/runtime-config"
    if ($runtimeResponse.StatusCode -ne 200) { throw "Runtime configuration endpoint returned HTTP $($runtimeResponse.StatusCode)." }
    if (($runtimeResponse.Headers['Cache-Control'] -as [string]) -notmatch 'no-store') {
        throw 'Runtime configuration endpoint must send Cache-Control: no-store.'
    }
    if (($runtimeResponse.Headers['Pragma'] -as [string]) -notmatch 'no-cache') {
        throw 'Runtime configuration endpoint must send Pragma: no-cache.'
    }
    $runtimePayload = $runtimeResponse.Content | ConvertFrom-Json
    if ($runtimePayload.environment -ne 'test' -or $runtimePayload.providers.email.active -ne 'mailpit') {
        throw 'Runtime configuration endpoint returned an unexpected safe provider payload.'
    }
    foreach ($secretName in @('JWT_SIGNING_KEY_B64', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64', 'DB_PASS')) {
        if ($runtimeResponse.Content -match [regex]::Escape($secretName)) {
            throw "Runtime configuration endpoint leaked $secretName."
        }
    }
    $postStatus = 0
    try {
        Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$backendBaseUrl/api/runtime-config" -Body '' | Out-Null
    } catch {
        if ($_.Exception.Response) { $postStatus = [int]$_.Exception.Response.StatusCode }
    }
    if ($postStatus -ne 405) { throw "Runtime configuration endpoint method guard returned HTTP $postStatus instead of 405." }

    Invoke-Compose @('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'dentisys', '-v', 'ON_ERROR_STOP=1', '-f', '/postgres/test-fixtures/live-stack.sql')

    $ledger = Get-AppliedMigrations
    Assert-MigrationLedgerMatchesActiveFiles -Applied $ledger -Context 'after initialization'
    $grant = Invoke-PsqlScalar "SELECT has_schema_privilege('dentisys', 'public', 'USAGE');"
    if ($grant -ne 't') { throw 'Application role does not have the expected schema grant.' }

    # Re-run the migration runner and require the ledger to remain unchanged.
    Invoke-Compose @('exec', '-T', 'db', 'sh', '/docker-entrypoint-initdb.d/001-migrations.sh')
    $ledgerAfter = Get-AppliedMigrations
    Assert-MigrationLedgerMatchesActiveFiles -Applied $ledgerAfter -Context 'after rerunning migrations'
    if (@(Compare-Object -ReferenceObject $ledger -DifferenceObject $ledgerAfter).Count -ne 0) {
        throw 'Migration runner was not idempotent.'
    }

    # Exercise the manual development seed exactly as an operator would, without
    # making it part of normal startup.
    $seedCommand = @('exec', '-T', 'db', 'psql', '-q', '-U', 'postgres', '-d', 'dentisys', '-v', 'ON_ERROR_STOP=1', '-f', '/postgres/test-seeds/development-demo.sql')
    Invoke-Compose $seedCommand
    $seedCountQuery = "SELECT concat_ws(',', (SELECT count(*) FROM user_accounts), (SELECT count(*) FROM courses), (SELECT count(*) FROM class_sections), (SELECT count(*) FROM students), (SELECT count(*) FROM enrollments), (SELECT count(*) FROM assessments), (SELECT count(*) FROM assessment_scores), (SELECT count(*) FROM attendance_records));"
    $seedCounts = Invoke-PsqlScalar $seedCountQuery
    Invoke-Compose $seedCommand
    $secondSeedCounts = Invoke-PsqlScalar $seedCountQuery
    if ($secondSeedCounts -ne $seedCounts) {
        throw "Manual demo seed is not idempotent (first $seedCounts; second $secondSeedCounts)."
    }

    $usableAccounts = Invoke-PsqlScalar "SELECT count(*) FROM user_accounts WHERE status = 'Active' AND login_email IN ('admin@bicol-u.edu.ph', 'faculty@bicol-u.edu.ph', 'secretary@bicol-u.edu.ph', 'student@bicol-u.edu.ph');"
    if ($usableAccounts -ne '4') { throw "Expected four usable demo accounts, found $usableAccounts." }

    $sequencesAligned = Invoke-PsqlScalar @"
SELECT bool_and(aligned)
FROM (
    SELECT last_value >= COALESCE((SELECT max(user_id) FROM user_accounts), 0) AS aligned FROM user_accounts_user_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(course_id) FROM courses), 0) FROM courses_course_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(cs_id) FROM class_sections), 0) FROM class_sections_cs_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(student_id) FROM students), 0) FROM students_student_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(enrollment_id) FROM enrollments), 0) FROM enrollments_enrollment_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(assessment_id) FROM assessments), 0) FROM assessments_assessment_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(score_id) FROM assessment_scores), 0) FROM assessment_scores_score_id_seq
    UNION ALL SELECT last_value >= COALESCE((SELECT max(record_id) FROM attendance_records), 0) FROM attendance_records_record_id_seq
) checks;
"@
    if ($sequencesAligned -ne 't') { throw 'Manual demo seed did not align every identity sequence.' }

    # Prove backup/restore only inside this disposable integration project.
    # The normal development volume is never targeted by this rehearsal.
    if ($project -notmatch '^dentisys-(integration|final)(-[a-z0-9-]+)?$') { throw 'Backup/restore guard rejected an unexpected disposable Compose project.' }
    $backupPath = '/tmp/dentisys-p02.backup'
    $restoreDatabase = 'dentisys_p02_restore'
    $countQuery = @"
SELECT COALESCE(string_agg(format('%s=%s', table_name, row_count), ',' ORDER BY table_name), '')
FROM (
    SELECT table_name,
           (xpath('/table/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), true, false, '')))[1]::text::bigint AS row_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) counts;
"@
    $sequenceQuery = "SELECT concat_ws(',', (SELECT last_value FROM user_accounts_user_id_seq), (SELECT last_value FROM courses_course_id_seq), (SELECT last_value FROM class_sections_cs_id_seq), (SELECT last_value FROM students_student_id_seq), (SELECT last_value FROM enrollments_enrollment_id_seq), (SELECT last_value FROM assessments_assessment_id_seq), (SELECT last_value FROM assessment_scores_score_id_seq), (SELECT last_value FROM attendance_records_record_id_seq));"
    $accountQuery = "SELECT COALESCE(string_agg(user_id || ':' || login_email || ':' || role || ':' || status, ',' ORDER BY user_id), '') FROM user_accounts;"
    $sourceCounts = Invoke-PsqlScalar $countQuery
    $sourceSequences = Invoke-PsqlScalar $sequenceQuery
    $sourceAccounts = Invoke-PsqlScalar $accountQuery
    try {
        Invoke-Compose @('exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-d', 'dentisys', '-Fc', '-f', $backupPath)
        Invoke-Compose @('exec', '-T', 'db', 'createdb', '-U', 'postgres', $restoreDatabase)
        Invoke-Compose @('exec', '-T', 'db', 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', $restoreDatabase, $backupPath)
        $restoreCounts = Invoke-PsqlScalarDatabase $restoreDatabase $countQuery
        $restoreSequences = Invoke-PsqlScalarDatabase $restoreDatabase $sequenceQuery
        $restoreAccounts = Invoke-PsqlScalarDatabase $restoreDatabase $accountQuery
        if ($restoreCounts -ne $sourceCounts) { throw "Backup/restore counts differ (source $sourceCounts; restored $restoreCounts)." }
        if ($restoreSequences -ne $sourceSequences) { throw "Backup/restore sequence positions differ (source $sourceSequences; restored $restoreSequences)." }
        if ($restoreAccounts -ne $sourceAccounts) { throw 'Backup/restore seeded account ledger differs.' }
    }
    finally {
        try { Invoke-Compose @('exec', '-T', 'db', 'dropdb', '-U', 'postgres', '--if-exists', $restoreDatabase) } catch { Write-Warning $_ }
        try { Invoke-Compose @('exec', '-T', 'db', 'rm', '-f', $backupPath) } catch { Write-Warning $_ }
    }

    Invoke-Compose @('exec', '-T', 'web', 'php', '/var/www/html/tests/database/ui_migration_test.php')
    Invoke-Compose @('exec', '-T', '-e', 'DB_TEST_HOST=db', '-e', 'DB_TEST_PORT=5432', '-e', 'DB_TEST_NAME=dentisys', '-e', 'DB_TEST_USER=dentisys', '-e', 'DB_TEST_PASS=integration-development-password', 'web', 'php', '/var/www/html/tests/database/postgres_integration_test.php')

    & (Join-Path $PSScriptRoot 'smoke.ps1') -BackendUrl $backendBaseUrl

    $env:E2E_BASE_URL = $frontendBaseUrl
    $env:E2E_MAILPIT_BASE_URL = "http://127.0.0.1:$MailpitUiPort"
    & npm run test:e2e:live
    if ($LASTEXITCODE -ne 0) { throw 'Live Playwright tests failed.' }

    $logs = (& docker compose @composeFiles logs db web 2>&1 | Out-String)
    if ($logs -match '22021|invalid byte sequence|invalid UTF-8') {
        throw 'PostgreSQL logs contain invalid UTF-8/22021 errors.'
    }

    Write-Host 'PASS: Disposable PostgreSQL integration, migration, PHP, live E2E, and log checks passed.'
}
finally {
    if (-not $KeepStack) {
        try { Invoke-Compose @('down', '-v', '--remove-orphans') } catch { Write-Warning $_ }
    } else {
        Write-Host "Integration stack kept under Compose project '$project'."
    }
}
