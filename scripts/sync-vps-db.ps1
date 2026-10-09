[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*$')]
    [string]$Server,
    [switch]$Apply,
    [switch]$Publish,
    [ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$')]
    [string]$Tag = 'demo',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*$')]
    [string]$Namespace = 'light505',
    [ValidateRange(1, 65535)]
    [int]$Port = 22,
    [string]$IdentityFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Publish -and -not $Apply) { throw '-Publish requires -Apply.' }
if ($Publish -and $Tag -like 'sha-*') { throw 'Use a moving tag such as demo; sha-* tags identify commits.' }
$Namespace = $Namespace.ToLowerInvariant()
$sshArgs = @('-p', "$Port")
$scpArgs = @('-P', "$Port")
if ($IdentityFile) {
    $identity = (Resolve-Path -LiteralPath $IdentityFile).Path
    if (-not (Test-Path -LiteralPath $identity -PathType Leaf)) { throw 'IdentityFile must be a key file.' }
    $sshArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
    $scpArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)." }
}

Push-Location $repoRoot
$stagingRoot = $null
try {
    $dirty = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to check the working tree.' }
    if ($dirty.Count -gt 0) { throw 'Refusing to sync a dirty working tree. Test and commit the changes first.' }
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $stageName = 'dentisys-sync-' + [Guid]::NewGuid().ToString('N')
    $stagingRoot = Join-Path $tempBase $stageName
    $snapshot = Join-Path $stagingRoot 'upload'
    New-Item -ItemType Directory -Path $snapshot | Out-Null
    $archive = Join-Path $stagingRoot 'commit.tar'
    Invoke-Native git @('archive', '--format=tar', '-o', $archive, 'HEAD', 'database/migrations', 'database/init.sql', 'database/apply-migrations.sh', 'scripts/migrate-vps.sh')
    Push-Location $stagingRoot
    try { Invoke-Native tar @('-xf', 'commit.tar', '-C', 'upload') }
    finally { Pop-Location }

    # One transfer and one SSH session; sudo/authentication prompts belong to SSH.
    $remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail
stage="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$stage" =~ ^/tmp/dentisys-sync-[0-9a-f]{32}$ ]] || exit 1
trap 'rm -rf -- "$stage"' EXIT
chmod 700 "$stage"
deploy_dir=/opt/dentisys
fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "$(id -u)" -ne 0 ]] || fail 'Use the non-root sudo account that deployed DentiSys.'
[[ -f "$deploy_dir/.env" ]] || fail 'Run deploy-vps.sh first, using this same sudo account.'
sudo -v
umask 077
exec 9>"$deploy_dir/.deploy.lock"
flock -n 9 || fail 'Another VPS deployment or database sync is running.'
# Check the whole set before installing anything; never remove or rewrite SQL.
for migration in "$deploy_dir"/database/migrations/*.sql; do
  [[ -f "$migration" ]] || continue
  incoming="$stage/database/migrations/$(basename "$migration")"
  [[ -f "$incoming" ]] || fail "Local branch is behind the server: missing $(basename "$migration"). Nothing installed."
  cmp -s <(sed 's/\r$//' "$migration") <(sed 's/\r$//' "$incoming") || fail "Migration differs: $(basename "$migration"). Do not rewrite migrations. Nothing installed."
done
for file in database/init.sql database/apply-migrations.sh; do
  if ! cmp -s "$stage/$file" "$deploy_dir/$file"; then
    echo "WARNING: $file changed. Rerun deploy-vps.sh from the matching bundle to refresh the db container's file mounts." >&2
    # Preserve the need to recreate db even after host copies match the bundle.
    touch "$deploy_dir/.db-recreate-required"
  fi
done
for file in database/init.sql database/apply-migrations.sh; do
  install -m 0640 "$stage/$file" "$deploy_dir/$file"
done
for migration in "$stage"/database/migrations/*.sql; do
  destination="$deploy_dir/database/migrations/$(basename "$migration")"
  [[ -f "$destination" ]] || install -m 0640 "$migration" "$destination"
done
install -m 0750 "$stage/scripts/migrate-vps.sh" "$deploy_dir/scripts/migrate-vps.sh"
if [[ "$1" == check ]]; then
  bash "$deploy_dir/scripts/migrate-vps.sh" --check
else
  bash "$deploy_dir/scripts/migrate-vps.sh"
fi
'@
    [IO.File]::WriteAllText((Join-Path $snapshot 'sync.sh'), ($remoteScript.Replace("`r`n", "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    $remoteStage = "/tmp/$stageName"
    Invoke-Native scp ($scpArgs + @('-r', $snapshot, "${Server}:$remoteStage"))
    $mode = 'check'
    if ($Apply) { $mode = 'apply' }
    Invoke-Native ssh ($sshArgs + @('-t', $Server, "bash $remoteStage/sync.sh $mode"))
    if ($Publish) {
        & (Join-Path $PSScriptRoot 'publish-images.ps1') -Tag $Tag -Namespace $Namespace
        Write-Host 'Images published. Watchtower will roll out within WATCHTOWER_POLL_INTERVAL seconds (default 300), plus pull/start time.'
    }
}
finally {
    if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
        $resolvedStage = [IO.Path]::GetFullPath($stagingRoot)
        $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStage -Leaf) -notmatch '^dentisys-sync-[0-9a-f]{32}$') {
            throw 'Refusing to remove an unexpected staging path.'
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
    Pop-Location
}
