[CmdletBinding()]
param(
    [switch] $PreflightOnly,
    [switch] $NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "==================================================="
Write-Host "          Starting DentiSys Local Environment"
Write-Host "==================================================="
Write-Host ""

# Step 1 & 2: Check docker CLI
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (!$dockerCmd) {
    Write-Host "ERROR: Docker CLI ('docker') is not available in system PATH."
    Write-Host "Please install Docker Desktop and ensure docker is accessible."
    exit 1
}

# Step 3: Check docker compose
$composeCheck = & docker compose version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'docker compose' is not available."
    exit 1
}

# Step 4: Parse root .env safely
function Read-EnvFile {
    param([string] $Path)

    $values = @{}
    if (Test-Path -LiteralPath $Path) {
        Get-Content -LiteralPath $Path | ForEach-Object {
            $line = $_.Trim()
            if ($line -eq "" -or $line.StartsWith("#") -or !$line.Contains("=")) {
                return
            }
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"').Trim("'")
            if ($key -ne "") {
                $values[$key] = $value
            }
        }
    }
    return $values
}

$envFile = Read-EnvFile (Join-Path $root ".env")

# Step 5: Resolve credentials with precedence (Process Env > Root .env > Defaults)
function Resolve-Setting {
    param(
        [string] $Name,
        [hashtable] $EnvFile,
        [string] $DefaultValue
    )
    $procValue = [Environment]::GetEnvironmentVariable($Name)
    if (![string]::IsNullOrWhiteSpace($procValue)) {
        return $procValue
    }
    if ($EnvFile.ContainsKey($Name) -and ![string]::IsNullOrWhiteSpace($EnvFile[$Name])) {
        return $EnvFile[$Name]
    }
    return $DefaultValue
}

$effectiveDbHostPort = Resolve-Setting "DB_HOST_PORT" $envFile "3306"
$effectiveDbName     = Resolve-Setting "DB_NAME"      $envFile "dentisys"
$effectiveDbUser     = Resolve-Setting "DB_USER"      $envFile "dentisys"
$effectiveDbPass     = Resolve-Setting "DB_PASS"      $envFile "local-development-password"

# Step 6: Validate docker compose syntax quietly
& docker compose --project-directory $root config --quiet 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker-compose configuration validation failed."
    exit 1
}

# Step 7: Parse effective compose config output safely for host DB port
$rawConfig = & docker compose --project-directory $root config 2>&1
$configuredPort = "3306"
if ($LASTEXITCODE -eq 0 -and $null -ne $rawConfig) {
    # Search for Published port under db service in compose config
    $configText = $rawConfig -join "`n"
    if ($configText -match 'published:\s*"?(\d+)"?') {
        $configuredPort = $Matches[1]
    } elseif ($configText -match '"127\.0\.0\.1:(\d+):3306"') {
        $configuredPort = $Matches[1]
    } elseif ($configText -match ':\s*"?(\d+):3306"?') {
        $configuredPort = $Matches[1]
    }
}

# Step 8: Require effective host DB port to equal 3306
if ($configuredPort -ne "3306" -or $effectiveDbHostPort -ne "3306") {
    $activePort = if ($configuredPort -ne "3306") { $configuredPort } else { $effectiveDbHostPort }
    Write-Host "DentiSys Docker MariaDB is configured to publish host port $activePort."
    Write-Host ""
    Write-Host "Update DB_HOST_PORT=3306 in your local .env, recreate the db service"
    Write-Host "without deleting its volume, and run the launcher again:"
    Write-Host "    docker compose up -d --force-recreate db"
    exit 1
}

Write-Host "Docker Compose configuration validated."
Write-Host "  Configured DB host port: 3306"
Write-Host "  Configured DB name:      $effectiveDbName"
Write-Host "  Configured DB user:      $effectiveDbUser"
Write-Host "  Configured DB password:  present"
Write-Host ""

# Helper to check if a local port has a listener
function Test-HostPortListening {
    param([int] $Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

# Helper to get listener process description
function Get-ListeningProcessInfo {
    param([int] $Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $conn) {
        $pidNum = $conn.OwningProcess
        $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { "Unknown" }
        return @{ PID = $pidNum; Name = $procName; Process = $proc }
    }
    return $null
}

# Step 9: Inspect DentiSys db container state
$dbContainerId = (& docker compose --project-directory $root ps -q db 2>&1 | Out-String).Trim()

# Step 10 & 11: Port conflict check if DB container is not running
if ([string]::IsNullOrWhiteSpace($dbContainerId)) {
    if (Test-HostPortListening 3306) {
        $procInfo = Get-ListeningProcessInfo 3306
        $procDesc = if ($procInfo) { "PID $($procInfo.PID) ($($procInfo.Name))" } else { "an external process" }
        Write-Host "Port 3306 is already in use by $procDesc."
        Write-Host ""
        Write-Host "DentiSys development uses Docker MariaDB on host port 3306."
        Write-Host "Stop XAMPP MySQL or the other conflicting process, then run the launcher again."
        exit 1
    }
    
    # Step 12: Start Docker MariaDB container
    Write-Host "Starting Docker MariaDB container on 127.0.0.1:3306..."
    & docker compose --project-directory $root up -d db
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to start Docker MariaDB service."
        exit 1
    }
    $dbContainerId = (& docker compose --project-directory $root ps -q db 2>&1 | Out-String).Trim()
}

# Step 13: Wait up to 120 seconds for DB container to become healthy
Write-Host "Waiting for Docker MariaDB container to be ready..."
$dbHealthy = $false
$maxDbWaitSeconds = 120
$elapsed = 0

while ($elapsed -lt $maxDbWaitSeconds) {
    if (![string]::IsNullOrWhiteSpace($dbContainerId)) {
        $healthStatus = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}" $dbContainerId 2>&1 | Out-String).Trim()
        if ($healthStatus -eq "healthy" -or $healthStatus -eq "running") {
            # Verify socket ping
            $pingResult = & docker compose --project-directory $root exec -T db mysqladmin ping -uroot -p$effectiveDbPass --silent 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dbHealthy = $true
                break
            }
        }
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}

if (!$dbHealthy) {
    Write-Host "ERROR: Docker MariaDB container failed to reach healthy status within $maxDbWaitSeconds seconds."
    exit 1
}

# Step 14: Confirm published port is 3306
$publishedPort = (& docker compose --project-directory $root port db 3306 2>&1 | Out-String).Trim()
if ($publishedPort -notmatch ':3306$') {
    Write-Host "ERROR: Docker DB service published port does not resolve to host port 3306 ($publishedPort)."
    exit 1
}

Write-Host "PASS: Docker MariaDB container is healthy and publishing 127.0.0.1:3306."

if ($PreflightOnly) {
    Write-Host ""
    Write-Host "Preflight checks passed cleanly (-PreflightOnly mode)."
    exit 0
}

# Step 15: Check port 8090 and port 5173 availability
if (Test-HostPortListening 8090) {
    $p8090 = Get-ListeningProcessInfo 8090
    Write-Host "ERROR: Port 8090 is already in use by PID $($p8090.PID) ($($p8090.Name))."
    Write-Host "Please stop the process using port 8090 before running the launcher."
    exit 1
}

if (Test-HostPortListening 5173) {
    $p5173 = Get-ListeningProcessInfo 5173
    Write-Host "ERROR: Port 5173 is already in use by PID $($p5173.PID) ($($p5173.Name))."
    Write-Host "Please stop the process using port 5173 before running the launcher."
    exit 1
}

# Save previous launcher env vars
$origDbHost = [Environment]::GetEnvironmentVariable("DB_HOST")
$origDbPort = [Environment]::GetEnvironmentVariable("DB_PORT")
$origDbName = [Environment]::GetEnvironmentVariable("DB_NAME")
$origDbUser = [Environment]::GetEnvironmentVariable("DB_USER")
$origDbPass = [Environment]::GetEnvironmentVariable("DB_PASS")

$phpProc = $null

try {
    # Temporarily set process env for launching child PHP
    [Environment]::SetEnvironmentVariable("DB_HOST", "127.0.0.1")
    [Environment]::SetEnvironmentVariable("DB_PORT", "3306")
    [Environment]::SetEnvironmentVariable("DB_NAME", $effectiveDbName)
    [Environment]::SetEnvironmentVariable("DB_USER", $effectiveDbUser)
    [Environment]::SetEnvironmentVariable("DB_PASS", $effectiveDbPass)

    Write-Host "Starting PHP Backend API on http://localhost:8090 ..."
    $phpProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title DentiSys Backend API (Port 8090) && cd /d `"$root`" && php -S localhost:8090 -t backend/public" -WorkingDirectory $root -PassThru
} finally {
    # Restore launcher env immediately
    [Environment]::SetEnvironmentVariable("DB_HOST", $origDbHost)
    [Environment]::SetEnvironmentVariable("DB_PORT", $origDbPort)
    [Environment]::SetEnvironmentVariable("DB_NAME", $origDbName)
    [Environment]::SetEnvironmentVariable("DB_USER", $origDbUser)
    [Environment]::SetEnvironmentVariable("DB_PASS", $origDbPass)
}

# Step 16, 17, 18: Poll PHP health endpoint http://localhost:8090/api/health
Write-Host "Validating PHP Backend API & Database connectivity..."
$backendHealthy = $false
$maxHealthWait = 15
$healthElapsed = 0

while ($healthElapsed -lt $maxHealthWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8090/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $json = $response.Content | ConvertFrom-Json
            if ($json.status -eq "ok" -and $json.database -eq "up") {
                $backendHealthy = $true
                break
            }
        }
    } catch {
        # Retry
    }
    Start-Sleep -Seconds 1
    $healthElapsed += 1
}

if (!$backendHealthy) {
    Write-Host "ERROR: Backend database health check failed or timed out at http://localhost:8090/api/health."
    Write-Host "The database server at 127.0.0.1:3306 was unreachable or authentication failed."
    if ($phpProc -and !$phpProc.HasExited) {
        $phpProc | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Host "PASS: PHP Backend API confirmed database connectivity at 127.0.0.1:3306."

# Step 19: Launch Vite Frontend
Write-Host "Starting Frontend Dev Server on http://localhost:5173 ..."
$npmCli = Join-Path $root "frontend"
try {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$npmCli`" && npm run dev" -WorkingDirectory $npmCli
} catch {
    Write-Host "ERROR: Failed to start Frontend dev server."
    if ($phpProc -and !$phpProc.HasExited) {
        $phpProc | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# Step 20: Open browser if permitted
if (!$NoBrowser) {
    Start-Sleep -Seconds 2
    Write-Host "Opening DentiSys in your web browser..."
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "==================================================="
Write-Host "   DentiSys local environment is up and running!"
Write-Host "==================================================="
