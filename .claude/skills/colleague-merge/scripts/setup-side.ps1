# Serve one side of a merge review: a detached worktree at <Ref> (or the main checkout for -Ref main),
# its own Vite dev server on <Port> (proxying /api to the backend on 8080), and app-<Name>.json for shots.mjs.
#   ./setup-side.ps1 -Name theirs -Ref origin/owhie-responsive -Port 5182 -Root <scratchpad>
#   ./setup-side.ps1 -Name merged -Ref main -Port 5183 -Root <scratchpad>    (the main checkout, e.g. mid-merge)
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Name,
    [Parameter(Mandatory)][string]$Ref,
    [Parameter(Mandatory)][ValidateRange(1024, 65535)][int]$Port,
    [Parameter(Mandatory)][string]$Root,
    [string]$Repo = 'C:\Users\decha\Desktop\Github\dentisys'
)
$ErrorActionPreference = 'Stop'

# Free the port: an earlier session's server may still hold it.
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }

if ($Ref -eq 'main') {
    $dir = $Repo
} else {
    $dir = Join-Path $Root "wt-$Name"
    if (Test-Path $dir) {
        & git -C $dir checkout --detach --quiet $Ref
    } else {
        & git -C $Repo worktree add --detach --quiet $dir $Ref
    }
    if ($LASTEXITCODE -ne 0) { throw "git could not put $Ref into $dir" }
    foreach ($nm in 'node_modules', 'frontend\node_modules') {
        $link = Join-Path $dir $nm
        if (-not (Test-Path $link)) { New-Item -ItemType Junction -Path $link -Target (Join-Path $Repo $nm) | Out-Null }
    }
}

$fe = Join-Path $dir 'frontend'
$log = Join-Path $Root "vite-$Name.log"
Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $Port, '--strictPort') `
    -WorkingDirectory $fe -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err" | Out-Null

$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    try { $ready = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw "Vite did not answer on $Port; see $log.err" }

$app = Get-Content (Join-Path $Repo '.claude\skills\ui-fix-demo\references\dentisys.app.json') -Raw
$appFile = Join-Path $Root "app-$Name.json"
[IO.File]::WriteAllText($appFile, ($app -replace 'http://localhost:5173', "http://127.0.0.1:$Port"))

$sha = (& git -C $dir rev-parse --short=12 HEAD).Trim()
Write-Host "$Name ready: http://127.0.0.1:$Port  ($sha in $dir)  app file: $appFile"
