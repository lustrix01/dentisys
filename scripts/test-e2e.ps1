[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $PlaywrightArgs
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$frontendVite = Join-Path $root 'frontend/node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $frontendVite)) {
    Write-Host 'Frontend dependencies are missing; installing from frontend/package-lock.json.'
    & npm --prefix frontend ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
}

$playwrightCli = Join-Path $root 'node_modules/@playwright/test/cli.js'
if (-not (Test-Path -LiteralPath $playwrightCli)) {
    throw 'Root Playwright dependencies are missing; run npm ci before npm run test:e2e.'
}

$server = $null
$exitCode = 1
try {
    $server = Start-Process -FilePath 'node' -ArgumentList @(
        $frontendVite,
        '--config', 'frontend/vite.config.ts',
        'frontend',
        '--host', '127.0.0.1',
        '--port', '15174',
        '--strictPort'
    ) -WorkingDirectory $root -WindowStyle Hidden -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:15174/' -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            if ($server.HasExited) { throw 'Vite development server exited before becoming ready.' }
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Timed out waiting for the Vite development server.' }

    & node $playwrightCli test @PlaywrightArgs
    $exitCode = $LASTEXITCODE
} finally {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}

exit $exitCode
