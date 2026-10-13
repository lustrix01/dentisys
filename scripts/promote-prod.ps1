# Promotes the exact demo images of an approved commit to production. Owner only: Claude must never run this script.
#   .\scripts\promote-prod.ps1 -Sha <approved commit> [-DryRun]
# Order: preflight (read-only) -> Owner GHCR token in a temporary Docker config -> database sync on the production VPS
# (backs up, applies new migrations) -> registry-side copy of dentisys-{web,frontend,biometric}:sha-<sha> to
# dentisys-*-prod:sha-<sha> and :prod (no build, no pull) -> digest check -> wait for Watchtower on the production VPS.
# Server settings come from ~/.dentisys/prod.env (PROD_SSH_HOST, PROD_SSH_PORT, PROD_SSH_USER, PROD_SSH_KEY).
# Without PROD_SSH_HOST only the images are promoted (first-time setup, before the production VPS exists).
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{7,40}$')]
    [string]$Sha,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*$')]
    [string]$Namespace = 'light505',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Namespace = $Namespace.ToLowerInvariant()
$names = @('web', 'frontend', 'biometric')

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    # Windows PowerShell treats redirected native stderr as an error record.
    $nativeCommand = Get-Command -Name $Command -ErrorAction Stop
    $nativePreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $nativeCommand @Arguments
        $nativeExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $nativePreference }
    if ($nativeExit -ne 0) { throw "$Command failed (exit $nativeExit)." }
}
function Get-NativeOutput {
    param([string]$Command, [string[]]$Arguments)
    $nativeCommand = Get-Command -Name $Command -ErrorAction Stop
    $nativePreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $text = (& $nativeCommand @Arguments | Out-String).Trim()
        $nativeExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $nativePreference }
    if ($nativeExit -ne 0) { return $null }
    return $text
}
function Get-Digest([string]$ref) {
    $json = Get-NativeOutput docker @('buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', $ref)
    if (-not $json) { return $null }
    return [string]($json | ConvertFrom-Json).digest
}

Push-Location $repoRoot
$tempConfig = $null
$oldDockerConfig = $env:DOCKER_CONFIG
try {
    # 1. Preflight: read-only.
    $short = Get-NativeOutput git @('rev-parse', '--verify', '--quiet', '--short=12', "$Sha^{commit}")
    if (-not $short) { throw "Commit $Sha does not exist locally. Run git fetch, then retry." }
    $head = Get-NativeOutput git @('rev-parse', '--short=12', 'HEAD')
    if ($head -ne $short) { throw "HEAD is $head, not $short. The database sync uses the migrations of HEAD. Run: git checkout $short   (then rerun this script)" }
    $dirty = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to check the working tree.' }
    if ($dirty.Count -gt 0) { throw 'The working tree is not clean. Commit or stash the changes, then rerun.' }
    foreach ($name in $names) {
        $ref = "ghcr.io/$Namespace/dentisys-${name}:sha-$short"
        if (-not (Get-Digest $ref)) { throw "Demo image not found: $ref. Publish and test the demo for this commit first." }
    }

    $settingsPath = Join-Path $HOME '.dentisys\prod.env'
    $prod = @{}
    if (Test-Path -LiteralPath $settingsPath) {
        foreach ($line in [IO.File]::ReadAllLines($settingsPath)) {
            $trimmed = $line.Trim()
            if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
            $eq = $trimmed.IndexOf('=')
            if ($eq -lt 1) { throw "${settingsPath}: expected KEY=VALUE, got '$trimmed'." }
            $prod[$trimmed.Substring(0, $eq).Trim()] = $trimmed.Substring($eq + 1).Trim().Trim('"', "'")
        }
    }
    $server = [bool]$prod['PROD_SSH_HOST']
    if ($server) {
        $sshPort = 2202
        if ($prod['PROD_SSH_PORT'] -and (-not [int]::TryParse($prod['PROD_SSH_PORT'], [ref]$sshPort) -or $sshPort -lt 1 -or $sshPort -gt 65535)) { throw "${settingsPath}: PROD_SSH_PORT must be 1-65535." }
        $sshUser = $prod['PROD_SSH_USER']
        if (-not $sshUser) { $sshUser = 'devops' }
        $sshKey = $prod['PROD_SSH_KEY']
        if (-not $sshKey -or -not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "${settingsPath}: PROD_SSH_KEY file not found: $sshKey" }
        $sshKey = (Resolve-Path -LiteralPath $sshKey).Path
        $target = "$sshUser@$($prod['PROD_SSH_HOST'])"
    }

    Write-Host "Plan for commit ${short}:"
    if ($server) { Write-Host "  1. Back up and apply new database migrations on $target (port $sshPort)." }
    else { Write-Host '  (no production server configured: images only)' }
    Write-Host "  2. Copy ghcr.io/$Namespace/dentisys-{web,frontend,biometric}:sha-$short to dentisys-*-prod:sha-$short and :prod (registry-side, no build)."
    Write-Host '  3. Verify the digests match.'
    if ($server) { Write-Host "  4. Wait up to 15 minutes for Watchtower to roll production to sha-$short." }
    if ($DryRun) { Write-Host 'Dry run: nothing was changed.'; return }

    # 2. Owner token, kept in a temporary Docker config that is deleted afterwards.
    $secure = Read-Host "GitHub token for $Namespace with write:packages" -AsSecureString
    if ($secure.Length -eq 0) { throw 'A token is required.' }
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $tempConfig = Join-Path $tempBase ('dentisys-promote-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempConfig | Out-Null
    $env:DOCKER_CONFIG = $tempConfig
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $nativePreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $plain | & docker login ghcr.io -u $Namespace --password-stdin | Out-Null
            $loginExit = $LASTEXITCODE
        }
        finally { $ErrorActionPreference = $nativePreference }
        if ($loginExit -ne 0) { throw 'docker login ghcr.io failed. Check the token (write:packages).' }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $plain = $null
        $secure.Dispose()
    }

    # 3. Database first: a failed migration must leave production untouched.
    if ($server) {
        & (Join-Path $PSScriptRoot 'sync-vps-db.ps1') -Server $target -Port $sshPort -IdentityFile $sshKey -Apply
        if (-not $?) { throw 'Database sync failed. Images were not promoted.' }
    }

    # 4. Registry-side copy of the exact demo images.
    foreach ($name in $names) {
        $source = "ghcr.io/$Namespace/dentisys-${name}:sha-$short"
        $dest = "ghcr.io/$Namespace/dentisys-$name-prod"
        Invoke-Native docker @('buildx', 'imagetools', 'create', '-t', "${dest}:sha-$short", '-t', "${dest}:prod", $source)
    }

    # 5. Same manifest digest on both sides.
    foreach ($name in $names) {
        $demoDigest = Get-Digest "ghcr.io/$Namespace/dentisys-${name}:sha-$short"
        $prodDigest = Get-Digest "ghcr.io/$Namespace/dentisys-$name-prod:prod"
        if (-not $demoDigest -or $demoDigest -ne $prodDigest) { throw "Digest mismatch for ${name}: demo $demoDigest, prod $prodDigest." }
    }
    Write-Host "Verified: the three -prod:prod images are identical to the demo sha-$short images."

    # 6. One SSH session (ufw rate-limits logins); -t lets the Owner type the sudo password.
    if ($server) {
        $remote = @'
set -u
sha='@SHA@'; deadline=$(( $(date +%s) + 900 )); d() { sudo docker "$@"; }
sudo -v || exit 1
declare -A want
for svc in web frontend biometric; do
  ref=$(d inspect --format '{{.Config.Image}}' "dentisys-$svc-1" 2>/dev/null) || { echo "ERROR: dentisys-$svc-1 is not running."; exit 1; }
  ref="${ref%:*}:sha-$sha"
  d --config /opt/dentisys/.docker pull -q "$ref" >/dev/null || { echo "ERROR: cannot pull $ref (not promoted, or the server's GHCR token expired)."; exit 1; }
  want[$svc]=$(d image inspect --format '{{.Id}}' "$ref"); d rmi "$ref" >/dev/null
done
while :; do
  pending=''
  for svc in web frontend biometric; do
    for c in $(d ps -a --format '{{.Names}}' | grep -E "^dentisys-$svc-[0-9]+$"); do
      read -r img health <<<"$(d inspect --format '{{.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c")"
      [[ "$img" == "${want[$svc]}" && "$health" =~ ^(healthy|none)$ ]] || pending+=" $c($health)"
    done
  done
  [[ -z "$pending" ]] && { echo "Deployed: web, frontend and biometric run sha-$sha and are healthy."; exit 0; }
  (( $(date +%s) >= deadline )) && { echo "ERROR: after 15 minutes still not on sha-$sha:$pending"; exit 1; }
  echo "$(date +%H:%M:%S) waiting for:$pending"; sleep 30
done
'@
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote.Replace('@SHA@', $short).Replace("`r`n", "`n")))
        Invoke-Native ssh @('-t', '-i', $sshKey, '-p', "$sshPort", '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new', $target, "bash <(echo $encoded | base64 -d)")
        Write-Host "Production now runs sha-$short"
    }
    else { Write-Host 'Images promoted to :prod; no production server configured yet' }
}
finally {
    $env:DOCKER_CONFIG = $oldDockerConfig
    if ($oldDockerConfig -eq $null) { Remove-Item Env:\DOCKER_CONFIG -ErrorAction SilentlyContinue }
    if ($tempConfig -and (Test-Path -LiteralPath $tempConfig)) {
        $resolvedStage = [IO.Path]::GetFullPath($tempConfig)
        $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStage -Leaf) -notmatch '^dentisys-promote-[0-9a-f]{32}$') {
            throw 'Refusing to remove an unexpected temporary path.'
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
    Pop-Location
}
