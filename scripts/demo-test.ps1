# Run live Playwright checks against the demo VPS through the SSH tunnel.
# Logins come from ~/.dentisys/demo.env and are passed as E2E_* variables; nothing is printed.
#   ./scripts/demo-test.ps1                       (read-only smoke check)
#   ./scripts/demo-test.ps1 e2e/live/<file>.ts    (a specific live spec)
# -Prod is for the Owner only (Claude has no production access): it checks the production site directly, with no tunnel.
#   ./scripts/demo-test.ps1 -Prod
#   ~/.dentisys/prod-test.env: PROD_BASE_URL (e.g. https://bu-dentisys.com) and PROD_(ADMIN|FACULTY|SECRETARY|STUDENT)_(EMAIL|PASSWORD)
#   ~/.dentisys/prod.env (same file promote-prod.ps1 uses): PROD_SSH_HOST, PROD_SSH_PORT (2202), PROD_SSH_USER (devops), PROD_SSH_KEY
#   for the audit-chain check; skipped with a note when prod.env is missing.
[CmdletBinding()]
param([string]$Spec = 'e2e/live/demo-smoke.spec.ts', [switch]$Prod)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Prod) {
    $settingsPath = Join-Path $HOME '.dentisys\prod-test.env'
    if (-not (Test-Path -LiteralPath $settingsPath)) { throw "Missing $settingsPath (PROD_BASE_URL and PROD_<ROLE>_EMAIL/PASSWORD)." }
    $pattern = '^\s*PROD_(BASE_URL|(ADMIN|FACULTY|SECRETARY|STUDENT)_(EMAIL|PASSWORD))\s*=\s*(.*)$'
}
else {
    $settingsPath = Join-Path $HOME '.dentisys\demo.env'
    & (Join-Path $PSScriptRoot 'demo-vps.ps1') tunnel-start
    if ($LASTEXITCODE -ne 0) { throw 'Demo tunnel is not working; see the message above.' }
    $pattern = '^\s*DEMO_(LOCAL_PORT|(ADMIN|FACULTY|SECRETARY|STUDENT)_(EMAIL|PASSWORD))\s*=\s*(.*)$'
}

foreach ($line in [IO.File]::ReadAllLines($settingsPath)) {
    if ($line -match $pattern) {
        $value = $Matches[4].Trim().Trim('"', "'")
        if ($Matches[1] -eq 'LOCAL_PORT') { $env:E2E_BASE_URL = "http://localhost:$value" }
        elseif ($Matches[1] -eq 'BASE_URL') { $env:E2E_BASE_URL = $value.TrimEnd('/') }
        elseif ($value) { Set-Item -Path "env:E2E_$($Matches[1])" -Value $value }
    }
}
if ($Prod -and -not $env:E2E_BASE_URL) { throw "$settingsPath must set PROD_BASE_URL." }

Push-Location $repoRoot
try {
    # Windows PowerShell treats native stderr warnings as errors under 'Stop'.
    $ErrorActionPreference = 'Continue'
    & npx playwright test -c playwright.live.config.ts $Spec
    $liveExit = $LASTEXITCODE
    if ($Prod) {
        # Read-only audit chain check inside the production web container, connecting like promote-prod.ps1.
        $prodSettings = Join-Path $HOME '.dentisys\prod.env'
        if (-not (Test-Path -LiteralPath $prodSettings)) { Write-Host "Audit chain check skipped: $prodSettings not found." }
        else {
            $prodEnv = @{}
            foreach ($line in [IO.File]::ReadAllLines($prodSettings)) {
                $trimmed = $line.Trim()
                if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
                $eq = $trimmed.IndexOf('=')
                if ($eq -lt 1) { continue }
                $prodEnv[$trimmed.Substring(0, $eq).Trim()] = $trimmed.Substring($eq + 1).Trim().Trim('"', "'")
            }
            $sshPort = 2202
            if ($prodEnv['PROD_SSH_PORT'] -and -not [int]::TryParse($prodEnv['PROD_SSH_PORT'], [ref]$sshPort)) { throw "$prodSettings : PROD_SSH_PORT must be a number." }
            $sshUser = $prodEnv['PROD_SSH_USER']
            if (-not $sshUser) { $sshUser = 'devops' }
            $sshKey = $prodEnv['PROD_SSH_KEY']
            if (-not $prodEnv['PROD_SSH_HOST']) { Write-Host 'Audit chain check skipped: PROD_SSH_HOST is not set in prod.env.' }
            elseif (-not $sshKey -or -not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "$prodSettings : PROD_SSH_KEY file not found: $sshKey" }
            else {
                & ssh -t -i (Resolve-Path -LiteralPath $sshKey).Path -p "$sshPort" -o IdentitiesOnly=yes "$sshUser@$($prodEnv['PROD_SSH_HOST'])" 'sudo docker exec dentisys-web-1 php /var/www/html/backend/bin/audit-verify-chain.php'
                if ($LASTEXITCODE -ne 0) { Write-Host 'Audit chain check FAILED on production.'; exit 1 }
            }
        }
        exit $liveExit
    }
    # Read-only audit chain check inside the demo web container (first run records the baseline).
    & (Join-Path $PSScriptRoot 'demo-vps.ps1') run 'sudo -n docker exec dentisys-web-1 php /var/www/html/backend/bin/audit-verify-chain.php'
    if ($LASTEXITCODE -ne 0) { Write-Host 'Audit chain check FAILED on the demo.'; exit 1 }
    exit $liveExit
}
finally { Pop-Location }
