[CmdletBinding()]
param(
    [switch] $KeepStack
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$project = 'dentisys-integration'
$composeFiles = @('-p', $project, '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml')
$env:DB_ADMIN_USER = 'postgres'
$env:DB_ADMIN_PASS = 'integration-postgres-admin'
$env:DB_NAME = 'dentisys'
$env:DB_USER = 'dentisys'
$env:DB_PASS = 'integration-development-password'
$env:BACKEND_HTTP_PORT = '18080'
$env:FRONTEND_HTTP_PORT = '15173'
$env:MAILPIT_UI_PORT = '18025'
$env:JWT_SIGNING_KEY_B64 = 'SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko='
$env:MFA_ENCRYPTION_KEY_B64 = 'RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU='
$env:AUDIT_MAC_KEY_B64 = 'TU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU0='

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

    Invoke-Compose @('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'dentisys', '-v', 'ON_ERROR_STOP=1', '-f', '/postgres/test-fixtures/live-stack.sql')

    $ledger = Invoke-PsqlScalar 'SELECT count(*) FROM _schema_migrations;'
    if ($ledger -ne '4') { throw "Expected four applied migrations, found $ledger." }
    $grant = Invoke-PsqlScalar "SELECT has_schema_privilege('dentisys', 'public', 'USAGE');"
    if ($grant -ne 't') { throw 'Application role does not have the expected schema grant.' }

    # Re-run the migration runner and require the ledger to remain unchanged.
    Invoke-Compose @('exec', '-T', 'db', 'sh', '/docker-entrypoint-initdb.d/001-migrations.sh')
    $ledgerAfter = Invoke-PsqlScalar 'SELECT count(*) FROM _schema_migrations;'
    if ($ledgerAfter -ne '4') { throw "Migration runner was not idempotent (found $ledgerAfter rows)." }

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

    $usableAccounts = Invoke-PsqlScalar "SELECT count(*) FROM user_accounts WHERE status = 'Active' AND login_email IN ('admin@bicol-u.edu.ph', 'faculty@bicol-u.edu.ph', 'secretary@bicol-u.edu.ph');"
    if ($usableAccounts -ne '3') { throw "Expected three usable demo accounts, found $usableAccounts." }

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

    Invoke-Compose @('exec', '-T', '-e', 'DB_TEST_HOST=db', '-e', 'DB_TEST_PORT=5432', '-e', 'DB_TEST_NAME=dentisys', '-e', 'DB_TEST_USER=dentisys', '-e', 'DB_TEST_PASS=integration-development-password', 'web', 'php', '/var/www/html/tests/database/postgres_integration_test.php')

    & (Join-Path $PSScriptRoot 'smoke.ps1') -BackendUrl 'http://127.0.0.1:18080'

    $env:E2E_BASE_URL = 'http://127.0.0.1:15173'
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
