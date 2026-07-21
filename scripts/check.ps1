param(
    [switch] $SkipDocker,
    [switch] $WithDatabase
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failed = $false
$lintBaselineErrors = 173
$lintBaselineWarnings = 13

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

Invoke-Step "Native PHP unit tests" {
    $tests = Get-ChildItem -LiteralPath (Join-Path $root "tests\backend") -Filter "*_test.php" | Where-Object { $_.Name -ne "auth_database_test.php" } | Sort-Object Name
    foreach ($test in $tests) {
        Invoke-Native "php" @($test.FullName)
    }
}

if ($WithDatabase) {
    Invoke-Step "Database integration tests" {
        $testScript = Join-Path $root "tests\backend\auth_database_test.php"
        $oldPort = $env:DB_PORT
        $oldUser = $env:DB_USER
        $oldPass = $env:DB_PASS

        if (-not $env:DB_PORT) { $env:DB_PORT = "3307" }
        if (-not $env:DB_USER) { $env:DB_USER = "root" }
        if (-not $env:DB_PASS) { $env:DB_PASS = "local-root-password" }

        try {
            Invoke-Native "php" @($testScript)
        } finally {
            $env:DB_PORT = $oldPort
            $env:DB_USER = $oldUser
            $env:DB_PASS = $oldPass
        }
    }
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
}

if ($failed) {
    exit 1
}

Write-Host ""
Write-Host "ALL CHECKS COMPLETED SUCCESSFULLY."
