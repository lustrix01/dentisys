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

# Helper to read root .env file
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

# Secure temporary option file creation with strict ACL protection
function New-SecureOptionFile {
    param([string] $Password)

    $tempCnf = [System.IO.Path]::GetTempFileName()
    try {
        if ($env:OS -match "Windows") {
            $acl = Get-Acl -LiteralPath $tempCnf
            $acl.SetAccessRuleProtection($true, $false)
            $currentUser = [System.Security.Principal.NTAccount]::new($env:USERDOMAIN, $env:USERNAME)
            $systemUser  = [System.Security.Principal.NTAccount]::new("NT AUTHORITY", "SYSTEM")

            $userRule   = [System.Security.AccessControl.FileSystemAccessRule]::new($currentUser, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
            $systemRule = [System.Security.AccessControl.FileSystemAccessRule]::new($systemUser,  [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)

            $acl.ResetAccessRule($userRule)
            $acl.AddAccessRule($systemRule)
            Set-Acl -LiteralPath $tempCnf $acl
        }

        $escapedPass = $Password.Replace('\', '\\').Replace('"', '\"')
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($tempCnf, "[client]`npassword=`"$escapedPass`"`n", $utf8NoBom)
        return $tempCnf
    } catch {
        if (Test-Path -LiteralPath $tempCnf) {
            Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
        }
        throw "Failed to create secure temporary option file: $_"
    }
}

# Helper to load backend app_config database fields ONLY via clean PHP subprocess stdout
function Get-NativePhpDbConfig {
    param([string] $RepoRoot)
    $cmd = "require '$RepoRoot/backend/app/config.php'; echo json_encode(app_config()['db'], JSON_UNESCAPED_SLASHES);"
    $jsonStr = & php -r $cmd 2>$null
    if ($LASTEXITCODE -eq 0 -and ![string]::IsNullOrWhiteSpace($jsonStr)) {
        try {
            $parsed = ($jsonStr | ConvertFrom-Json)
            $props = $parsed.psobject.Properties.Name
            $allowedProps = @('host', 'port', 'name', 'user', 'pass')
            foreach ($p in $props) {
                if ($allowedProps -notcontains $p) {
                    Write-Host "WARNING: Unexpected field '$p' in native database configuration."
                    return $null
                }
            }
            return $parsed
        } catch {
            return $null
        }
    }
    return $null
}

# Docker credential resolution (Process Env > Root .env > Docker Defaults)
function Resolve-DockerCredentials {
    param([hashtable] $EnvFile)

    $procHost = [Environment]::GetEnvironmentVariable("DB_HOST")
    $procPort = [Environment]::GetEnvironmentVariable("DB_PORT")
    $procName = [Environment]::GetEnvironmentVariable("DB_NAME")
    $procUser = [Environment]::GetEnvironmentVariable("DB_USER")
    $procPass = [Environment]::GetEnvironmentVariable("DB_PASS")

    $hostName = if (![string]::IsNullOrWhiteSpace($procHost)) { $procHost } else { "127.0.0.1" }
    $port     = if (![string]::IsNullOrWhiteSpace($procPort)) { $procPort } elseif ($EnvFile.ContainsKey("DB_HOST_PORT")) { $EnvFile["DB_HOST_PORT"] } else { "3306" }
    $dbName   = if (![string]::IsNullOrWhiteSpace($procName)) { $procName } elseif ($EnvFile.ContainsKey("DB_NAME")) { $EnvFile["DB_NAME"] } else { "dentisys" }
    $dbUser   = if (![string]::IsNullOrWhiteSpace($procUser)) { $procUser } elseif ($EnvFile.ContainsKey("DB_USER")) { $EnvFile["DB_USER"] } else { "dentisys" }
    $dbPass   = if ($null -ne $procPass) { $procPass } elseif ($EnvFile.ContainsKey("DB_PASS")) { $EnvFile["DB_PASS"] } else { "local-development-password" }

    return @{
        Host     = $hostName
        Port     = $port
        Database = $dbName
        User     = $dbUser
        Password = $dbPass
        Type     = "Docker MariaDB"
    }
}

# Native credential resolution (Process Env > local.php via PHP stdout > Native Defaults)
function Resolve-NativeCredentials {
    param([string] $RepoRoot)

    $procHost = [Environment]::GetEnvironmentVariable("DB_HOST")
    $procPort = [Environment]::GetEnvironmentVariable("DB_PORT")
    $procName = [Environment]::GetEnvironmentVariable("DB_NAME")
    $procUser = [Environment]::GetEnvironmentVariable("DB_USER")
    $procPass = [Environment]::GetEnvironmentVariable("DB_PASS")

    $phpConfig = Get-NativePhpDbConfig $RepoRoot

    $hostName = if (![string]::IsNullOrWhiteSpace($procHost)) { $procHost } elseif ($phpConfig -and $phpConfig.host) { $phpConfig.host } else { "127.0.0.1" }
    $port     = if (![string]::IsNullOrWhiteSpace($procPort)) { $procPort } elseif ($phpConfig -and $phpConfig.port) { [string]$phpConfig.port } else { "3306" }
    $dbName   = if (![string]::IsNullOrWhiteSpace($procName)) { $procName } elseif ($phpConfig -and $phpConfig.name) { $phpConfig.name } else { "dentisys" }
    $dbUser   = if (![string]::IsNullOrWhiteSpace($procUser)) { $procUser } elseif ($phpConfig -and $phpConfig.user) { $phpConfig.user } else { "dentisys" }
    $dbPass   = if ($null -ne $procPass) { $procPass } elseif ($phpConfig -and $null -ne $phpConfig.pass) { $phpConfig.pass } else { "" }

    return @{
        Host     = $hostName
        Port     = $port
        Database = $dbName
        User     = $dbUser
        Password = $dbPass
        Type     = "Native MySQL/MariaDB"
    }
}

# Port listener helpers
function Test-HostPortListening {
    param([int] $Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Get-ListeningProcessInfo {
    param([int] $Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $conn) {
        $pidNum = $conn.OwningProcess
        $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { "Unknown" }
        $procPath = if ($proc -and $proc.MainModule) { $proc.MainModule.FileName } else { "" }
        return @{ PID = $pidNum; Name = $procName; Path = $procPath; Process = $proc }
    }
    return $null
}

# Native process classification helper
function Classify-NativeProcess {
    param([hashtable] $ProcInfo)
    if (!$ProcInfo) { return "native MySQL/MariaDB" }

    $name = $ProcInfo.Name.ToLower()
    $path = $ProcInfo.Path.ToLower()

    if ($path.Contains("\xampp\") -and ($name -eq "mysqld" -or $name -eq "mysqld.exe")) {
        return "XAMPP MySQL"
    }
    if ($name -eq "mysqld" -or $name -eq "mysqld.exe") {
        return "native MySQL"
    }
    if ($name -eq "mariadbd" -or $name -eq "mariadbd.exe") {
        return "native MariaDB"
    }
    return "native MySQL/MariaDB"
}

# Check database client command
function Resolve-DatabaseClientCommand {
    foreach ($candidate in @("mariadb", "mysql", "C:\xampp\mysql\bin\mysql.exe")) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

# Helper to safely test if Docker engine daemon is responsive
function Test-DockerEngineAvailable {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (!$dockerCmd) { return $false }
    $oldEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $null = & docker info 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

# Main Execution Flow
$envFile = Read-EnvFile (Join-Path $root ".env")
$selectedRuntime = $null
$credentials = $null
$isDocker = $false
$dbAvailable = $false

# Step 1: Check port 3306 listener state and Docker daemon responsiveness
$port3306Occupied = Test-HostPortListening 3306
$dockerDaemonRunning = Test-DockerEngineAvailable

if ($port3306Occupied) {
    # Check if listener is expected DentiSys Docker container
    $dbContainerId = ""
    if ($dockerDaemonRunning) {
        $oldEap = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $dbContainerId = (& docker compose --project-directory $root ps -q db 2>$null | Out-String).Trim()
        } catch {} finally {
            $ErrorActionPreference = $oldEap
        }
    }

    if (![string]::IsNullOrWhiteSpace($dbContainerId)) {
        # Docker container owns port 3306
        $isDocker = $true
        $credentials = Resolve-DockerCredentials $envFile
        $selectedRuntime = "Docker MariaDB"
        Write-Host "Reusing active DentiSys Docker MariaDB container on 127.0.0.1:3306."
    } else {
        # Check process on port 3306
        $procInfo = Get-ListeningProcessInfo 3306
        $classified = Classify-NativeProcess $procInfo
        $procName = if ($procInfo) { $procInfo.Name } else { "Unknown" }

        if ($procName -eq "mysqld" -or $procName -eq "mariadbd" -or $classified -match "MySQL|MariaDB") {
            $isDocker = $false
            $credentials = Resolve-NativeCredentials $root
            $credentials.Type = $classified
            $selectedRuntime = $classified
            Write-Host "Detected active $classified on port 3306."
        } else {
            $procDesc = if ($procInfo) { "PID $($procInfo.PID) ($($procInfo.Name))" } else { "an external process" }
            Write-Host "WARNING: Port 3306 is occupied by $procDesc (not a recognized DentiSys database)."
            Write-Host "Skipping database connection and migrations. Proceeding with offline database mode."
        }
    }
} else {
    # Port 3306 is FREE: Check Docker engine to start container
    if ($dockerDaemonRunning) {
        $oldEap = $ErrorActionPreference
        $dockerUsable = $false
        try {
            $ErrorActionPreference = "Continue"
            $composeCheck = & docker compose version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $dockerUsable = $true
            }
        } catch {} finally {
            $ErrorActionPreference = $oldEap
        }

        if ($dockerUsable) {
            # Validate docker compose syntax quietly
            & docker compose --project-directory $root config --quiet 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Starting DentiSys Docker MariaDB on port 3306..."
                & docker compose --project-directory $root up -d db 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    # Wait for DB container health
                    $maxDbWaitSeconds = 120
                    $elapsed = 0
                    $dbHealthy = $false
                    while ($elapsed -lt $maxDbWaitSeconds) {
                        $containerId = (& docker compose --project-directory $root ps -q db 2>$null | Out-String).Trim()
                        if (![string]::IsNullOrWhiteSpace($containerId)) {
                            $healthStatus = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}" $containerId 2>$null | Out-String).Trim()
                            if ($healthStatus -eq "healthy" -or $healthStatus -eq "running") {
                                $dbHealthy = $true
                                break
                            }
                        }
                        Start-Sleep -Seconds 2
                        $elapsed += 2
                    }

                    if ($dbHealthy) {
                        $isDocker = $true
                        $credentials = Resolve-DockerCredentials $envFile
                        $selectedRuntime = "Docker MariaDB"
                        Write-Host "PASS: Docker MariaDB container is healthy and publishing 127.0.0.1:3306."
                    } else {
                        Write-Host "WARNING: Docker MariaDB container failed to reach healthy status within $maxDbWaitSeconds seconds."
                    }
                } else {
                    Write-Host "WARNING: Failed to start Docker MariaDB container."
                }
            } else {
                Write-Host "WARNING: docker-compose configuration validation failed."
            }
        }
    }

    if (!$credentials) {
        $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
        $xamppInstalled = Test-Path -LiteralPath "C:\xampp\mysql\bin\mysqld.exe"

        Write-Host "WARNING: No active development database found on port 3306."
        if ($dockerCmd -and !$dockerDaemonRunning) {
            Write-Host "Docker is installed, but the Docker engine is not running."
        }
        if ($xamppInstalled) {
            Write-Host "XAMPP appears to be installed, but its MySQL service is not running."
        }
        Write-Host "Choose one of the following development database options:"
        Write-Host "1. Install and start Docker Desktop, then run:"
        Write-Host "   docker compose up -d db"
        Write-Host "2. Start XAMPP MySQL from the XAMPP Control Panel."
        Write-Host "Skipping database connection and migrations. Proceeding in offline database mode."
    }
}

function Build-ProvisioningSql {
    param(
        [string] $DbName,
        [string] $UserName,
        [string] $UserPassword
    )
    $bt = [char]96
    $cleanDb = $DbName.Replace([string][char]96, "")
    $u = $UserName.Replace("'", "''")
    $p = $UserPassword.Replace("'", "''")

    return "CREATE DATABASE IF NOT EXISTS ${bt}${cleanDb}${bt} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; " +
        "CREATE USER IF NOT EXISTS '$u'@'localhost' IDENTIFIED BY '$p'; " +
        "ALTER USER '$u'@'localhost' IDENTIFIED BY '$p'; " +
        "GRANT ALL PRIVILEGES ON ${bt}${cleanDb}${bt}.* TO '$u'@'localhost'; " +
        "CREATE USER IF NOT EXISTS '$u'@'127.0.0.1' IDENTIFIED BY '$p'; " +
        "ALTER USER '$u'@'127.0.0.1' IDENTIFIED BY '$p'; " +
        "GRANT ALL PRIVILEGES ON ${bt}${cleanDb}${bt}.* TO '$u'@'127.0.0.1'; " +
        "CREATE USER IF NOT EXISTS '$u'@'%' IDENTIFIED BY '$p'; " +
        "ALTER USER '$u'@'%' IDENTIFIED BY '$p'; " +
        "GRANT ALL PRIVILEGES ON ${bt}${cleanDb}${bt}.* TO '$u'@'%'; " +
        "FLUSH PRIVILEGES;"
}

function Invoke-RootProvisioning {
    param(
        [string] $ClientPath,
        [string] $HostName,
        [string] $Port,
        [string] $DbName,
        [string] $UserName,
        [string] $UserPassword
    )

    $rootPasses = @("", "local-root-password", "root")
    if (![string]::IsNullOrWhiteSpace($env:DB_ROOT_PASS)) {
        $rootPasses = @($env:DB_ROOT_PASS) + $rootPasses
    }

    $sql = Build-ProvisioningSql -DbName $DbName -UserName $UserName -UserPassword $UserPassword

    foreach ($rp in $rootPasses) {
        $rootCnf = New-SecureOptionFile -Password $rp
        try {
            # Try 1: TCP connection
            $res = & $ClientPath "--defaults-extra-file=$rootCnf" "-h" $HostName "-P" "$Port" "-u" "root" "-e" $sql 2>&1
            if ($LASTEXITCODE -eq 0) { return $true }

            # Try 2: Local socket/pipe connection (XAMPP default on Windows)
            $res2 = & $ClientPath "--defaults-extra-file=$rootCnf" "-u" "root" "-e" $sql 2>&1
            if ($LASTEXITCODE -eq 0) { return $true }
        } finally {
            if (Test-Path -LiteralPath $rootCnf) {
                Remove-Item -LiteralPath $rootCnf -Force -ErrorAction SilentlyContinue
            }
        }
    }
    return $false
}

# Validate Database Client Tooling and Database Connection if candidate credentials exist
if ($credentials) {
    $clientPath = Resolve-DatabaseClientCommand
    if ($clientPath) {
        $tempCnf = New-SecureOptionFile -Password $credentials.Password
        $dbExists = $false
        $authSuccess = $false

        $dbPreExisted = $false
        $isUpToDate = $false
        $oldEap = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            # Ping / Auth check
            $pingSql = "SELECT 1;"
            $pingResult = & $clientPath "--defaults-extra-file=$tempCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "-e" $pingSql 2>&1
            if ($LASTEXITCODE -eq 0) {
                $authSuccess = $true
            } elseif (!$isDocker -and ($credentials.Password -eq "" -or $null -eq $credentials.Password)) {
                # Fallback credential testing for native/XAMPP MySQL connections using 'local-development-password'
                if (Test-Path -LiteralPath $tempCnf) {
                    Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
                }
                $fallbackCnf = New-SecureOptionFile -Password "local-development-password"
                try {
                    $fallbackPing = & $clientPath "--defaults-extra-file=$fallbackCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "-e" $pingSql 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        $authSuccess = $true
                        $credentials.Password = "local-development-password"
                        $tempCnf = $fallbackCnf
                        $fallbackCnf = $null
                        Write-Host "Connected to $($credentials.Type) using fallback password 'local-development-password'."
                    }
                } finally {
                    if ($fallbackCnf -and (Test-Path -LiteralPath $fallbackCnf)) {
                        Remove-Item -LiteralPath $fallbackCnf -Force -ErrorAction SilentlyContinue
                    }
                }
            }

            if (!$authSuccess -and !$isDocker) {
                Write-Host "MySQL user '$($credentials.User)' not found or access denied. Auto-creating user '$($credentials.User)' based on .env configuration..."
                if (Invoke-RootProvisioning -ClientPath $clientPath -HostName $credentials.Host -Port $credentials.Port -DbName $credentials.Database -UserName $credentials.User -UserPassword $credentials.Password) {
                    # Retry auth with provisioned user
                    $retryPing = & $clientPath "--defaults-extra-file=$tempCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "-e" $pingSql 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        $authSuccess = $true
                        Write-Host "PASS: Automatically created MySQL user '$($credentials.User)' and database '$($credentials.Database)'."
                    }
                }
            }

            if ($authSuccess) {
                # Check DB existence
                $dbCheckSql = "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$($credentials.Database)';"
                $dbRes = & $clientPath "--defaults-extra-file=$tempCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "--batch" "--skip-column-names" "-e" $dbCheckSql 2>&1
                if ($LASTEXITCODE -eq 0 -and ($dbRes -join "").Trim() -eq $credentials.Database) {
                    $dbExists = $true
                    $dbPreExisted = $true

                    # Check if baseline table user_accounts exists
                    $tblCheckSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$($credentials.Database)' AND TABLE_NAME='user_accounts';"
                    $tblRes = & $clientPath "--defaults-extra-file=$tempCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "--batch" "--skip-column-names" "-e" $tblCheckSql 2>&1
                    $tblCount = 0
                    if ($LASTEXITCODE -eq 0 -and [int]::TryParse(($tblRes -join "").Trim(), [ref]$tblCount) -and $tblCount -gt 0) {
                        $isUpToDate = $true
                    }
                } else {
                    # Database missing or user lacks access: auto-provision
                    Write-Host "Database '$($credentials.Database)' does not exist or user lacks privileges on $($credentials.Type). Provisioning database..."
                    $targetDb = $credentials.Database
                    $createSql = "CREATE DATABASE IF NOT EXISTS $targetDb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    $createRes = & $clientPath "--defaults-extra-file=$tempCnf" "-h" $credentials.Host "-P" "$($credentials.Port)" "-u" $credentials.User "-e" $createSql 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "PASS: Automatically provisioned database '$($credentials.Database)'."
                        $dbExists = $true
                    } elseif (!$isDocker) {
                        # User lacks CREATE DATABASE or GRANT privileges; fallback to root connection
                        if (Invoke-RootProvisioning -ClientPath $clientPath -HostName $credentials.Host -Port $credentials.Port -DbName $credentials.Database -UserName $credentials.User -UserPassword $credentials.Password) {
                            Write-Host "PASS: Automatically provisioned database '$($credentials.Database)' and granted privileges to '$($credentials.User)' using root connection."
                            $dbExists = $true
                        }
                    }

                    if (!$dbExists) {
                        Write-Host "WARNING: Failed to auto-create database '$($credentials.Database)': $createRes"
                    }
                }
            }
        } finally {
            $ErrorActionPreference = $oldEap
            if (Test-Path -LiteralPath $tempCnf) {
                Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
            }
        }

        if ($authSuccess -and $dbExists) {
            $dbAvailable = $true
            if ($dbPreExisted) {
                if ($isUpToDate) {
                    Write-Host "Database '$($credentials.Database)' is ready and up to date."
                } else {
                    Write-Host "======================================================================"
                    Write-Host " WARNING: Existing database '$($credentials.Database)' detected."
                    Write-Host " Pre-existing database objects will NOT be dropped or overwritten."
                    Write-Host " If you want a clean install, please back up or drop manually."
                    Write-Host "======================================================================"
                }
            }
        } elseif (!$authSuccess) {
            Write-Host "WARNING: Could not authenticate to $($credentials.Type) at $($credentials.Host):$($credentials.Port) as user '$($credentials.User)'."
            Write-Host "Skipping database migrations. Proceeding in offline database mode."
        } elseif (!$dbExists) {
            Write-Host "WARNING: The configured DentiSys database '$($credentials.Database)' could not be provisioned on the selected $($credentials.Type) server."
            Write-Host "Skipping database migrations. Proceeding in offline database mode."
        }
    } else {
        Write-Host "WARNING: No supported database client (mysql or mariadb) is available in PATH."
        Write-Host "Skipping database migrations. Proceeding in offline database mode."
    }
}

# Invoke Migrations in a Child PowerShell Process if DB is available
$origHost = [Environment]::GetEnvironmentVariable("DB_HOST")
$origPort = [Environment]::GetEnvironmentVariable("DB_PORT")
$origName = [Environment]::GetEnvironmentVariable("DB_NAME")
$origUser = [Environment]::GetEnvironmentVariable("DB_USER")
$origPass = [Environment]::GetEnvironmentVariable("DB_PASS")

if ($dbAvailable -and $credentials) {
    try {
        [Environment]::SetEnvironmentVariable("DB_HOST", $credentials.Host)
        [Environment]::SetEnvironmentVariable("DB_PORT", [string]$credentials.Port)
        [Environment]::SetEnvironmentVariable("DB_NAME", $credentials.Database)
        [Environment]::SetEnvironmentVariable("DB_USER", $credentials.User)
        [Environment]::SetEnvironmentVariable("DB_PASS", $credentials.Password)

        Write-Host "Running database migrations on $($credentials.Host):$($credentials.Port) ($($credentials.Database))..."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$root\scripts\migrate.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: Database migration execution failed. Proceeding in offline database mode."
            $dbAvailable = $false
        }
    } finally {
        [Environment]::SetEnvironmentVariable("DB_HOST", $origHost)
        [Environment]::SetEnvironmentVariable("DB_PORT", $origPort)
        [Environment]::SetEnvironmentVariable("DB_NAME", $origName)
        [Environment]::SetEnvironmentVariable("DB_USER", $origUser)
        [Environment]::SetEnvironmentVariable("DB_PASS", $origPass)
    }
} else {
    Write-Host "Database is offline or unavailable. Skipping migrations."
}

if ($PreflightOnly) {
    Write-Host ""
    if ($dbAvailable) {
        Write-Host "Preflight checks and migrations passed cleanly (-PreflightOnly mode)."
    } else {
        Write-Host "Preflight checks completed with database offline/skipped (-PreflightOnly mode)."
    }
    exit 0
}

# Check port 8090 and port 5173 availability
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

# Start PHP Backend API
Write-Host "Starting PHP Backend API on http://localhost:8090 ..."
try {
    if ($dbAvailable -and $credentials) {
        [Environment]::SetEnvironmentVariable("DB_HOST", $credentials.Host)
        [Environment]::SetEnvironmentVariable("DB_PORT", [string]$credentials.Port)
        [Environment]::SetEnvironmentVariable("DB_NAME", $credentials.Database)
        [Environment]::SetEnvironmentVariable("DB_USER", $credentials.User)
        [Environment]::SetEnvironmentVariable("DB_PASS", $credentials.Password)
    }

    $phpProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title DentiSys Backend API (Port 8090) && cd /d `"$root`" && php -S localhost:8090 -t backend/public" -WorkingDirectory $root -PassThru
} finally {
    [Environment]::SetEnvironmentVariable("DB_HOST", $origHost)
    [Environment]::SetEnvironmentVariable("DB_PORT", $origPort)
    [Environment]::SetEnvironmentVariable("DB_NAME", $origName)
    [Environment]::SetEnvironmentVariable("DB_USER", $origUser)
    [Environment]::SetEnvironmentVariable("DB_PASS", $origPass)
}

# Poll PHP backend health endpoint http://localhost:8090/api/health
Write-Host "Validating PHP Backend API & Database connectivity..."
$backendHealthy = $false
$maxHealthWait = 15
$healthElapsed = 0

while ($healthElapsed -lt $maxHealthWait) {
    try {
        $req = [System.Net.WebRequest]::Create("http://localhost:8090/api/health")
        $req.Timeout = 2000
        $res = $null
        try {
            $res = $req.GetResponse()
        } catch [System.Net.WebException] {
            $res = $_.Exception.Response
        }

        if ($null -ne $res) {
            $stream = $res.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            $res.Close()

            if (![string]::IsNullOrWhiteSpace($content)) {
                $json = $content | ConvertFrom-Json
                if ($json.status -eq "ok" -and $json.database -eq "up") {
                    $backendHealthy = $true
                    Write-Host "PASS: PHP Backend API confirmed database connectivity at $($credentials.Host):$($credentials.Port)."
                    break
                } elseif ($json.database -eq "down" -or $json.status -eq "error") {
                    $backendHealthy = $true
                    Write-Host "WARNING: PHP Backend API is running, but database is offline/unreachable."
                    break
                }
            }
        }
    } catch {
        # Retry until timeout
    }
    Start-Sleep -Seconds 1
    $healthElapsed++
}

if (!$backendHealthy) {
    Write-Host "ERROR: PHP Backend API failed health check on http://localhost:8090/api/health."
    if ($phpProc -and !$phpProc.HasExited) {
        $phpProc | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Host "PASS: PHP Backend API confirmed database connectivity at $($credentials.Host):$($credentials.Port)."

# Start Vite Frontend Dev Server
Write-Host "Starting Frontend Dev Server on http://localhost:5173 ..."
$viteProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title DentiSys Frontend Dev (Port 5173) && cd /d `"$root`" && npm run dev" -WorkingDirectory $root -PassThru

# Open Browser unless -NoBrowser
if (!$NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "==================================================="
Write-Host "   DentiSys local environment is up and running!"
Write-Host "==================================================="
