param(
    [switch] $SkipDocker
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failed = $false
$lintBaselineErrors = 300
$lintBaselineWarnings = 30

function Invoke-Step {
    param(
        [string] $Name,
        [scriptblock] $Script
    )

    Write-Host ""
    Write-Host "== $Name =="
    try {
        & $Script
    } catch {
        $script:failed = $true
        Write-Host "FAIL: $Name"
        Write-Host $_
    }
}

function Invoke-Lint {
    $output = & npm --prefix (Join-Path $root "frontend") run lint 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        Write-Host "PASS: Frontend lint passed."
        return
    }

    $summary = $output | Select-String -Pattern '([0-9]+)\s+problems\s+\(([0-9]+)\s+errors,\s+([0-9]+)\s+warnings\)' | Select-Object -Last 1
    if ($null -eq $summary) {
        throw "Frontend lint failed and the summary could not be interpreted safely."
    }

    $errors = [int] $summary.Matches[0].Groups[2].Value
    $warnings = [int] $summary.Matches[0].Groups[3].Value

    Write-Host "Lint summary: $errors errors, $warnings warnings."

    if ($errors -le $lintBaselineErrors -and $warnings -le $lintBaselineWarnings) {
        Write-Host "EXPECTED BASELINE FAILURE - NO REGRESSION"
        return
    }

    throw "Frontend lint regression detected. Baseline is $lintBaselineErrors errors and $lintBaselineWarnings warnings; actual is $errors errors and $warnings warnings."
}

function Invoke-Native {
    param(
        [string] $Command,
        [string[]] $Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command exited with code $LASTEXITCODE."
    }
}

Invoke-Step "Frontend lint" {
    Invoke-Lint
}

Invoke-Step "Frontend build" {
    Invoke-Native "npm" @("--prefix", (Join-Path $root "frontend"), "run", "build")
}

Invoke-Step "PHP syntax" {
    $phpFiles = Get-ChildItem -LiteralPath (Join-Path $root "backend"), (Join-Path $root "tests\backend") -Recurse -Filter "*.php"
    foreach ($file in $phpFiles) {
        Invoke-Native "php" @("-l", $file.FullName)
    }
}

Invoke-Step "Native PHP tests" {
    $tests = Get-ChildItem -LiteralPath (Join-Path $root "tests\backend") -Filter "*_test.php" | Sort-Object Name
    foreach ($test in $tests) {
        Invoke-Native "php" @($test.FullName)
    }
}

Invoke-Step "Database & Seed validation" {
    $m004 = Join-Path $root "database\migrations\004_development_seed.sql"
    if (Test-Path -LiteralPath $m004) {
        throw "004_development_seed.sql should be absent from database/migrations/."
    }

    $seedSql = Join-Path $root "database\seed.sql"
    if (!(Test-Path -LiteralPath $seedSql)) {
        throw "database/seed.sql is missing."
    }

    $initSql = Join-Path $root "database\init.sql"
    if (!(Test-Path -LiteralPath $initSql)) {
        throw "database/init.sql is missing."
    }

    $migrationDir = Join-Path $root "database\migrations"
    $migrationFiles = Get-ChildItem -LiteralPath $migrationDir -File -Filter "*.sql" | Sort-Object Name
    if ($migrationFiles.Count -eq 0) {
        throw "No direct .sql migration files found in database/migrations/."
    }
    Write-Host ("Discovered {0} direct SQL migration files:" -f $migrationFiles.Count)
    foreach ($mf in $migrationFiles) {
        Write-Host ("  - {0}" -f $mf.Name)
    }

    Write-Host "Running generator backend/scripts/generate_seed_sql.php..."
    $genScript = Join-Path $root "backend\scripts\generate_seed_sql.php"
    Invoke-Native "php" @($genScript)

    if (Test-Path -LiteralPath $m004) {
        throw "Running generator recreated migration 004_development_seed.sql! Generator must only write database/seed.sql."
    }
    if (!(Test-Path -LiteralPath $seedSql)) {
        throw "database/seed.sql was not generated."
    }
    Write-Host "PASS: Database & Seed validation passed cleanly."
}

if ($SkipDocker) {
    Write-Host ""
    Write-Host "SKIP: Docker Compose validation was skipped by parameter."
    if ($failed) { exit 1 }
    exit 0
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Invoke-Step "Docker Compose config" {
        Invoke-Native "docker" @("compose", "--project-directory", $root, "config", "--quiet")
    }
} else {
    Write-Host ""
    Write-Host "SKIP: Docker is unavailable. Run 'docker compose config --quiet' from the repository root when Docker is installed."
}

if ($failed) {
    exit 1
}
