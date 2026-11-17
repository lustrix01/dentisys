# Undo setup-side.ps1: stop the Vite servers on the review ports, remove the wt-* worktrees under <Root>
# (junctions first, so node_modules in the main checkout is never touched), and prune.
#   ./cleanup.ps1 -Root <scratchpad>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Root,
    [int[]]$Ports = @(5181, 5182, 5183),
    [string]$Repo = 'C:\Users\decha\Desktop\Github\dentisys'
)
$ErrorActionPreference = 'Stop'
Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }
foreach ($wt in Get-ChildItem -Path $Root -Directory -Filter 'wt-*' -ErrorAction SilentlyContinue) {
    foreach ($nm in 'node_modules', 'frontend\node_modules') {
        $link = Join-Path $wt.FullName $nm
        # rmdir removes only the junction itself, never the target's contents
        if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null }
    }
    & git -C $Repo worktree remove --force $wt.FullName
    Write-Host "removed $($wt.Name)"
}
& git -C $Repo worktree prune
Write-Host 'review servers stopped; worktrees removed'
