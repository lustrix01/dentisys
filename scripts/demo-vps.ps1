# Demo VPS access for testing: run a command over SSH, or open a localhost tunnel to the demo app.
# Settings come from ~/.dentisys/demo.env (outside the repo). Demo only: never point it at production.
#   ./scripts/demo-vps.ps1 run "<command>"
#   ./scripts/demo-vps.ps1 upload <local-file> <remote-path>
#   ./scripts/demo-vps.ps1 tunnel-start | tunnel-stop | status
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('run', 'upload', 'tunnel-start', 'tunnel-stop', 'status')]
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
