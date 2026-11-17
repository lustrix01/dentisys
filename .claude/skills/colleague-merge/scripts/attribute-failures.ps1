# Which browser-test failures did the colleague cause? Reads the failing specs from a mocked e2e log of theirs,
# re-runs exactly those in the base worktree, and prints the split. Any failure that also fails on base is
# not theirs and must be reported separately.
#   ./attribute-failures.ps1 -Log <theirs e2e log> -Base <wt-base dir> -Root <scratchpad>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Log,
    [Parameter(Mandatory)][string]$Base,
    [Parameter(Mandatory)][string]$Root
)
$ErrorActionPreference = 'Stop'

function Get-Failing([string]$path) {
    # Playwright's summary lines look like:  "  12) [chromium] › e2e\faculty.spec.ts:469:7 › ..."
    # Get-Content handles both UTF-8 and the UTF-16 that PowerShell 5.1 '*>' writes.
    Get-Content $path | ForEach-Object {
        # \S stands for the arrow, which PowerShell 5.1 would misread in a BOM-less script
        if ($_ -match '^\s+\d+\) \[[^\]]+\] \S (e2e[\\/][^ ]+?):(\d+):\d+ \S') { ($Matches[1] -replace '\\', '/') + ':' + $Matches[2] }
    } | Sort-Object -Unique
}

$failing = @(Get-Failing $Log)
if ($failing.Count -eq 0) { Write-Host 'No failures in the log: nothing to attribute.'; exit 0 }
Write-Host "$($failing.Count) failing test locations (file:line) on theirs; re-running them on base ($Base)..."

$baseLog = Join-Path $Root 'e2e-base-rerun.log'
# A child -File process (the script moves to its own repo root); Node's stderr warning must not stop this script.
$ErrorActionPreference = 'Continue'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Base 'scripts\test-e2e.ps1') --reporter=line @failing *> $baseLog
$ErrorActionPreference = 'Stop'
$alsoBase = @(Get-Failing $baseLog)
# Guard: a base run that never started (Vite error, missing deps) lists no failures and would blame theirs for all.
$passedLine = Get-Content $baseLog | Where-Object { $_ -match '^\s+(\d+) passed' } | Select-Object -Last 1
$passed = if ($passedLine -match '(\d+) passed') { [int]$Matches[1] } else { 0 }
if ($passed + $alsoBase.Count -eq 0) { throw "The base run produced no results; read $baseLog before attributing anything." }

$theirs = @($failing | Where-Object { $alsoBase -notcontains $_ })
Write-Host ''
Write-Host "Theirs: $($theirs.Count) of $($failing.Count) test locations fail on theirs and pass on base."
if ($alsoBase.Count) {
    Write-Host "Not theirs: $($alsoBase.Count) also fail on base (pre-existing; report separately):"
    $alsoBase | ForEach-Object { Write-Host "  $_" }
}
Write-Host "Base re-run log: $baseLog"
