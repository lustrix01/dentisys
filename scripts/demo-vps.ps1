# Demo VPS access for testing: run a command over SSH, or open a localhost tunnel to the demo app.
# Settings come from ~/.dentisys/demo.env (outside the repo). Demo only: never point it at production.
#   ./scripts/demo-vps.ps1 run "<command>"
#   ./scripts/demo-vps.ps1 upload <local-file> <remote-path>
#   ./scripts/demo-vps.ps1 wait-deploy <sha>   (after publish-images.ps1: waits until the VPS runs sha-<sha>)
#   ./scripts/demo-vps.ps1 migrate   (backs up and applies new database migrations via sync-vps-db.ps1; required before a release that adds migrations)
#   ./scripts/demo-vps.ps1 recompute-grades preview|apply   (one-time recalculation of current-term grades on the demo; preview writes nothing)
#   ./scripts/demo-vps.ps1 tunnel-start | tunnel-stop | status
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('run', 'upload', 'wait-deploy', 'migrate', 'recompute-grades', 'tunnel-start', 'tunnel-stop', 'status')]
    [string]$Action,
    [Parameter(Position = 1)]
    [string]$Command,
    [Parameter(Position = 2)]
    [string]$RemotePath
)

$ErrorActionPreference = 'Stop'
$settingsDir = Join-Path $HOME '.dentisys'
$settingsPath = Join-Path $settingsDir 'demo.env'

function Read-Settings {
    if (-not (Test-Path -LiteralPath $settingsPath)) { throw "Missing $settingsPath. Create it from the template in the rollout notes." }
    $values = @{}
    $lineNo = 0
    foreach ($line in [IO.File]::ReadAllLines($settingsPath)) {
        $lineNo++
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -lt 1) { throw "${settingsPath} line ${lineNo}: expected KEY=VALUE." }
        $values[$trimmed.Substring(0, $eq).Trim()] = $trimmed.Substring($eq + 1).Trim().Trim('"', "'")
    }
    foreach ($key in 'DEMO_SSH_HOST', 'DEMO_SSH_USER', 'DEMO_SSH_KEY') {
        if (-not $values[$key]) { throw "${settingsPath}: $key is empty." }
    }
    foreach ($key in 'DEMO_SSH_PORT', 'DEMO_LOCAL_PORT', 'DEMO_REMOTE_PORT') {
        $port = 0
        if (-not [int]::TryParse([string]$values[$key], [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
            throw "${settingsPath}: $key must be a port number (1-65535), got '$($values[$key])'."
        }
    }
    if (-not (Test-Path -LiteralPath $values['DEMO_SSH_KEY'])) { throw "${settingsPath}: DEMO_SSH_KEY file not found: $($values['DEMO_SSH_KEY'])" }
    return $values
}

function Get-SshArgs($s) {
    # accept-new: a changed IP is trusted on first use without a prompt; a changed key for a known host still fails.
    return @('-i', $s['DEMO_SSH_KEY'], '-p', $s['DEMO_SSH_PORT'], '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
        '-o', 'StrictHostKeyChecking=accept-new', "$($s['DEMO_SSH_USER'])@$($s['DEMO_SSH_HOST'])")
}

function Get-Listener([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"
    return [pscustomobject]@{ Id = $conn.OwningProcess; Name = $proc.Name; CommandLine = [string]$proc.CommandLine }
}

function Test-OurTunnel($listener, $s) {
    return $listener -and $listener.Name -eq 'ssh.exe' -and $listener.CommandLine -like "*-L 127.0.0.1:$($s['DEMO_LOCAL_PORT']):127.0.0.1:$($s['DEMO_REMOTE_PORT'])*"
}

function Show-AppCheck([int]$port) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 15
        Write-Host "App answered HTTP $($r.StatusCode) at http://localhost:$port/"
    } catch {
        Write-Host "Tunnel is open but the app did not answer at http://localhost:$port/ : $($_.Exception.Message)"
        exit 1
    }
}

$s = Read-Settings
$localPort = [int]$s['DEMO_LOCAL_PORT']

switch ($Action) {
    'run' {
        if (-not $Command) { throw 'Usage: demo-vps.ps1 run "<command>"' }
        # Send the command base64-encoded so Windows argument quoting cannot mangle it.
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Command.Replace("`r`n", "`n")))
        & ssh @(Get-SshArgs $s) "echo $encoded | base64 -d | bash"
        exit $LASTEXITCODE
    }
    'upload' {
        if (-not $Command -or -not $RemotePath) { throw 'Usage: demo-vps.ps1 upload <local-file> <remote-path>' }
        if (-not (Test-Path -LiteralPath $Command -PathType Leaf)) { throw "Local file not found: $Command" }
        $a = Get-SshArgs $s
        # scp takes -P for the port; the last element of Get-SshArgs is user@host.
        $scpArgs = @('-P', $s['DEMO_SSH_PORT']) + $a[0..1] + $a[4..($a.Count - 2)] + @($Command, "$($a[-1]):$RemotePath")
        & scp @scpArgs
        exit $LASTEXITCODE
    }
    'wait-deploy' {
        if ($Command -notmatch '^[0-9a-f]{7,40}$') { throw 'Usage: demo-vps.ps1 wait-deploy <commit sha, as printed by publish-images.ps1>' }
        # One SSH session polls on the server (ufw rate-limits repeated SSH logins).
        # Watchtower pulls :demo; this pulls sha-<sha> only to learn its image ID, then untags it.
        $remote = @'
set -u
sha='@SHA@'; deadline=$(( $(date +%s) + 900 )); d() { sudo -n docker "$@"; }
declare -A want
for svc in web frontend biometric; do
  ref=$(d inspect --format '{{.Config.Image}}' "dentisys-$svc-1" 2>/dev/null) || { echo "ERROR: dentisys-$svc-1 is not running."; exit 1; }
  ref="${ref%:*}:sha-$sha"
  d --config /opt/dentisys/.docker pull -q "$ref" >/dev/null || { echo "ERROR: cannot pull $ref (not published, or the server's GHCR token expired)."; exit 1; }
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
        & ssh @(Get-SshArgs $s) "echo $([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote.Replace('@SHA@', $Command).Replace("`r`n", "`n")))) | base64 -d | bash"
        exit $LASTEXITCODE
    }
    'migrate' {
        & (Join-Path $PSScriptRoot 'sync-vps-db.ps1') -Server "$($s['DEMO_SSH_USER'])@$($s['DEMO_SSH_HOST'])" -Port ([int]$s['DEMO_SSH_PORT']) -IdentityFile $s['DEMO_SSH_KEY'] -Apply
        exit $LASTEXITCODE
    }
    'recompute-grades' {
        if ($Command -notin 'preview', 'apply') { throw 'Usage: demo-vps.ps1 recompute-grades preview|apply' }
        & ssh @(Get-SshArgs $s) "sudo -n docker exec dentisys-web-1 php /var/www/html/backend/bin/recompute-current-grades.php $Command"
        exit $LASTEXITCODE
    }
    'tunnel-start' {
        $listener = Get-Listener $localPort
        if (Test-OurTunnel $listener $s) {
            Write-Host "Tunnel already running (PID $($listener.Id))."
            Show-AppCheck $localPort
            exit 0
        }
        if ($listener) {
            throw "Port $localPort is used by $($listener.Name) (PID $($listener.Id)). Stop it or change DEMO_LOCAL_PORT in $settingsPath."
        }
        $forward = "127.0.0.1:${localPort}:127.0.0.1:$($s['DEMO_REMOTE_PORT'])"
        $sshArgs = @('-N', '-L', $forward, '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30') + (Get-SshArgs $s)
        $proc = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -WindowStyle Hidden -PassThru
        for ($i = 0; $i -lt 30 -and -not (Get-Listener $localPort); $i++) {
            if ($proc.HasExited) { throw "SSH exited (code $($proc.ExitCode)). Check DEMO_SSH_* in $settingsPath." }
            Start-Sleep -Milliseconds 500
        }
        if (-not (Get-Listener $localPort)) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw 'Tunnel did not open within 15 seconds.' }
        Write-Host "Tunnel open (PID $($proc.Id)): http://localhost:$localPort/"
        Show-AppCheck $localPort
        exit 0
    }
    'tunnel-stop' {
        $listener = Get-Listener $localPort
        if (Test-OurTunnel $listener $s) {
            Stop-Process -Id $listener.Id -Force
            Write-Host "Tunnel stopped (PID $($listener.Id))."
        } else {
            Write-Host 'No demo tunnel running.'
        }
    }
    'status' {
        $listener = Get-Listener $localPort
        if (Test-OurTunnel $listener $s) { Write-Host "Tunnel running (PID $($listener.Id)): http://localhost:$localPort/" }
        elseif ($listener) { Write-Host "Port $localPort is used by $($listener.Name) (PID $($listener.Id)), not the demo tunnel." }
        else { Write-Host 'Tunnel not running.' }
    }
}
