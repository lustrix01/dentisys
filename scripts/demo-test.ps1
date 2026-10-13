# Run live Playwright checks against the demo VPS through the SSH tunnel.
# Logins come from ~/.dentisys/demo.env and are passed as E2E_* variables; nothing is printed.
#   ./scripts/demo-test.ps1                       (read-only smoke check)
#   ./scripts/demo-test.ps1 e2e/live/<file>.ts    (a specific live spec)
[CmdletBinding()]
param([string]$Spec = 'e2e/live/demo-smoke.spec.ts')

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$settingsPath = Join-Path $HOME '.dentisys\demo.env'

& (Join-Path $PSScriptRoot 'demo-vps.ps1') tunnel-start
if ($LASTEXITCODE -ne 0) { throw 'Demo tunnel is not working; see the message above.' }

foreach ($line in [IO.File]::ReadAllLines($settingsPath)) {
    if ($line -match '^\s*DEMO_(LOCAL_PORT|(ADMIN|FACULTY|SECRETARY|STUDENT)_(EMAIL|PASSWORD))\s*=\s*(.*)$') {
        $value = $Matches[4].Trim().Trim('"', "'")
        if ($Matches[1] -eq 'LOCAL_PORT') { $env:E2E_BASE_URL = "http://localhost:$value" }
        elseif ($value) { Set-Item -Path "env:E2E_$($Matches[1])" -Value $value }
    }
}

Push-Location $repoRoot
try {
    # Windows PowerShell treats native stderr warnings as errors under 'Stop'.
    $ErrorActionPreference = 'Continue'
    & npx playwright test -c playwright.live.config.ts $Spec
    exit $LASTEXITCODE
}
finally { Pop-Location }
