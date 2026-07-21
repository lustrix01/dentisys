param(
    [string] $HostName,
    [int] $Port = 0,
    [string] $DatabaseName,
    [string] $User,
    [string] $Password,
    [string] $MysqlCommand
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDir = Join-Path $root "database\migrations"
$portWasProvided = $PSBoundParameters.ContainsKey("Port")

function Read-EnvFile {
    param([string] $Path)

    $values = @{}
    if (!(Test-Path -LiteralPath $Path)) {
        return $values
    }

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

    return $values
}

function Resolve-Setting {
    param(
        [string] $Name,
        [object] $ParameterValue,
        [hashtable] $EnvFile,
        [object] $DefaultValue = $null
    )

    if ($PSBoundParameters.ContainsKey("ParameterValue") -and $null -ne $ParameterValue -and "$ParameterValue" -ne "") {
        return $ParameterValue
    }

    $envValue = [Environment]::GetEnvironmentVariable($Name)
    if (![string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }

    if ($EnvFile.ContainsKey($Name) -and ![string]::IsNullOrWhiteSpace($EnvFile[$Name])) {
        return $EnvFile[$Name]
    }

    return $DefaultValue
}

function Resolve-DbPort {
    param([hashtable] $EnvFile)

    if ($portWasProvided -and $Port -gt 0) {
        return $Port
    }

    if (![string]::IsNullOrWhiteSpace($env:DB_PORT)) {
        return [int] $env:DB_PORT
    }

    if ($EnvFile.ContainsKey("DB_PORT") -and ![string]::IsNullOrWhiteSpace($EnvFile["DB_PORT"])) {
        return [int] $EnvFile["DB_PORT"]
    }

    if (![string]::IsNullOrWhiteSpace($env:DB_HOST_PORT)) {
        return [int] $env:DB_HOST_PORT
    }

    if ($EnvFile.ContainsKey("DB_HOST_PORT") -and ![string]::IsNullOrWhiteSpace($EnvFile["DB_HOST_PORT"])) {
        return [int] $EnvFile["DB_HOST_PORT"]
    }

    return 3306
}

function Resolve-DatabaseClient {
    param([string] $RequestedCommand)

    if (![string]::IsNullOrWhiteSpace($RequestedCommand)) {
        $command = Get-Command $RequestedCommand -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
        throw "Database client '$RequestedCommand' is unavailable."
    }

    foreach ($candidate in @("mariadb", "mysql", "C:\xampp\mysql\bin\mysql.exe")) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }

    throw "No supported database client is available. Install or expose mariadb/mysql, or use XAMPP's mysql client."
}

function Get-CleanString {
    param([object] $Value)
    if ($null -eq $Value) { return "" }
    $s = [string]$Value
    return $s.Trim()
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

$envFile = Read-EnvFile (Join-Path $root ".env")

if (!$PSBoundParameters.ContainsKey("HostName")) {
    $HostName = Resolve-Setting "DB_HOST" $null $envFile "127.0.0.1"
}
if (!$PSBoundParameters.ContainsKey("DatabaseName")) {
    $DatabaseName = Resolve-Setting "DB_NAME" $null $envFile
}
if (!$PSBoundParameters.ContainsKey("User")) {
    $User = Resolve-Setting "DB_USER" $null $envFile
}
if (!$PSBoundParameters.ContainsKey("Password")) {
    $Password = Resolve-Setting "DB_PASS" $null $envFile
}
$Port = Resolve-DbPort $envFile

if ([string]::IsNullOrWhiteSpace($HostName)) { $HostName = "127.0.0.1" }
if ([string]::IsNullOrWhiteSpace($DatabaseName)) { throw "DB_NAME is required. Set it with -DatabaseName, DB_NAME, or root .env." }
if ([string]::IsNullOrWhiteSpace($User)) { throw "DB_USER is required. Set it with -User, DB_USER, or root .env." }
if ($null -eq $Password) { throw "DB_PASS is required. Set it with -Password, DB_PASS, or root .env." }

$client = Resolve-DatabaseClient $MysqlCommand

Write-Host ('Resolved database target: host=' + $HostName + ' port=' + $Port + ' database=' + $DatabaseName + ' user=' + $User + ' password=<redacted>')

# Create secure temporary option file with ACL protection
$tempCnf = New-SecureOptionFile -Password $Password

try {

    function Invoke-ClientCommand {
        param(
            [string] $ClientPath,
            [string[]] $ExtraArgs,
            [string] $InputSqlFile = $null
        )

        $baseArgs = @("--defaults-extra-file=$tempCnf", "-h", $HostName, "-P", "$Port", "-u", $User, $DatabaseName)
        $fullArgs = $baseArgs + $ExtraArgs

        if (![string]::IsNullOrWhiteSpace($InputSqlFile)) {
            Get-Content -LiteralPath $InputSqlFile | & $ClientPath $fullArgs
        } else {
            & $ClientPath $fullArgs
        }
    }

    function Invoke-SqlFile {
        param(
            [string] $Client,
            [string] $Path,
            [string] $Label
        )

        if (!(Test-Path -LiteralPath $Path -PathType Leaf)) {
            $err = 'Required SQL file is missing: ' + $Path
            throw $err
        }

        Write-Host ($Label + ': ' + $Path)
        Invoke-ClientCommand -ClientPath $Client -ExtraArgs @() -InputSqlFile $Path
        if ($LASTEXITCODE -ne 0) {
            $err = 'SQL execution failed (' + $Label + '): ' + $Path
            throw $err
        }
    }

    function Get-DatabaseTableCount {
        param(
            [string] $Client,
            [string] $TableName
        )

        $checkSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + $DatabaseName + "' AND TABLE_NAME='" + $TableName + "';"
        $count = Invoke-ClientCommand -ClientPath $Client -ExtraArgs @("--batch", "--skip-column-names", "-e", $checkSql)
        if ($LASTEXITCODE -ne 0 -or $null -eq $count) { return -1 }
        $str = Get-CleanString $count
        if ($str -eq "") { return -1 }
        return [int]$str
    }

    # ---- Dynamic Migration Discovery ----
    $migrationFiles = Get-ChildItem -LiteralPath $migrationDir -File -Filter "*.sql" | Sort-Object Name
    $activeVersions = @($migrationFiles | Select-Object -ExpandProperty Name)

    # ---- Mandatory Condition 3: Execute database/init.sql FIRST ----
    $initSqlPath = Join-Path $root "database\init.sql"
    Invoke-SqlFile -Client $client -Path $initSqlPath -Label "INITIALIZE"

    # Well-known tables from the old 46-table schema (legacy detection).
    $legacyTablePatterns = @(
        "access_role", "permission", "role_permission",
        "academic_term", "course_component", "component", "component_type",
        "student_user_account", "user_preference",
        "student_term_grade", "facial_template", "student_image",
        "attendance_session", "attendance_override", "device",
        "retention_policy", "retention_policy_version",
        "retention_case", "retention_record", "remedial_attempt", "remedial_log", "retention_risk",
        "biometric_consent", "faculty", "faculty_approval",
        "secretary_invitation", "secretary_assignment",
        "mfa_credential", "mfa_recovery_code",
        "refresh_token", "access_token_revocation", "password_reset_token",
        "auth_throttle", "audit_chain", "audit_event", "audit_log",
        "email_delivery"
    )

    # Target application tables defined by the Phase 2 baseline.
    $targetTables = @(
        "user_accounts", "role_permissions", "students", "class_sections",
        "courses", "enrollments", "assessments", "assessment_scores",
        "attendance_records", "biometric_profiles", "auth_sessions",
        "security_tokens", "audit_events", "email_outbox", "system_settings"
    )

    # Preflight check function.
    function Invoke-MigrationPreflight {
        param(
            [string] $Client,
            [string[]] $ActiveVersions,
            [string[]] $LegacyTablePatterns,
            [string[]] $TargetTables
        )

        $schemaCount = Get-DatabaseTableCount -Client $Client -TableName "_schema_migrations"
        $schemaTableExists = ($schemaCount -gt 0)
        $migrationInfo = @{}
        $recordedCount = 0

        if ($schemaTableExists) {
            $rows = Invoke-ClientCommand -ClientPath $Client -ExtraArgs @("--batch", "--skip-column-names", "-e", "SELECT version FROM _schema_migrations ORDER BY version;")
            if ($LASTEXITCODE -eq 0 -and $null -ne $rows) {
                foreach ($row in $rows) {
                    $v = Get-CleanString $row
                    if ($v -ne "") {
                        $migrationInfo[$v] = $true
                        $recordedCount++
                    }
                }
            }
        }

        # Mandatory Condition 4: Treat empty history as no history
        if (-not $schemaTableExists -or $recordedCount -eq 0) {
            foreach ($tbl in $TargetTables) {
                $cnt = Get-DatabaseTableCount -Client $Client -TableName $tbl
                if ($cnt -gt 0) {
                    $msg = 'Target table ' + $tbl + ' already exists in database ' + $DatabaseName + ' but no baseline migration record was found. The baseline is clean-install only. Create a fresh database or drop all existing objects first.'
                    throw $msg
                }
            }

            foreach ($pattern in $LegacyTablePatterns) {
                $cnt = Get-DatabaseTableCount -Client $Client -TableName $pattern
                if ($cnt -gt 0) {
                    $msg = 'Legacy ' + $pattern + ' table found in database ' + $DatabaseName + '. The baseline is clean-install only. Create a fresh database or drop all existing objects first.'
                    throw $msg
                }
            }

            Write-Host "PASS: Preflight - clean database. Proceeding with baseline."
            return
        }

        # Mandatory Condition 5: Reject unknown recorded versions
        $recordedKeys = $migrationInfo.Keys
        $unknownRecordFound = $false
        foreach ($key in $recordedKeys) {
            if ($ActiveVersions -notcontains $key) {
                Write-Host ('ERROR: Migration version ' + $key + ' is recorded in _schema_migrations but is not part of active migration files.')
                Write-Host ('       Recorded versions: ' + ($recordedKeys -join ', '))
                Write-Host ('       Active versions: ' + ($ActiveVersions -join ', '))
                $unknownRecordFound = $true
            }
        }
        if ($unknownRecordFound) {
            throw "Legacy or unknown migration records found. Create a fresh database or reset _schema_migrations."
        }

        # Mandatory Condition 5: Enforce contiguous ordered prefix
        $seenUnapplied = $false
        foreach ($av in $ActiveVersions) {
            if ($migrationInfo.ContainsKey($av)) {
                if ($seenUnapplied) {
                    $msg = 'Inconsistent migration history: ' + $av + ' is recorded as applied, but a preceding active migration was not applied.'
                    throw $msg
                }
            } else {
                $seenUnapplied = $true
            }
        }

        # Check schema objects for applied versions exist
        if ($migrationInfo.ContainsKey("001_baseline_schema.sql")) {
            foreach ($tbl in $TargetTables) {
                $cnt = Get-DatabaseTableCount -Client $Client -TableName $tbl
                if ($cnt -eq 0) {
                    $msg = 'Expected table ' + $tbl + ' (from applied migration 001_baseline_schema.sql) not found in database ' + $DatabaseName + '.'
                    throw $msg
                }
            }
        }

        foreach ($pattern in $LegacyTablePatterns) {
            $cnt = Get-DatabaseTableCount -Client $Client -TableName $pattern
            if ($cnt -gt 0) {
                $msg = 'Legacy table ' + $pattern + ' found alongside current baseline migrations. The database is in an inconsistent state. Create a fresh database.'
                throw $msg
            }
        }

        Write-Host "PASS: Preflight - database is in a valid current-baseline state."
    }

    # Step 8: Preflight validation
    Invoke-MigrationPreflight -Client $client -ActiveVersions $activeVersions -LegacyTablePatterns $legacyTablePatterns -TargetTables $targetTables

    if ($migrationFiles.Count -eq 0) {
        Write-Host "No SQL migration files found."
        exit 0
    }

    # Steps 9 & 10: Apply unapplied migrations and record history
    foreach ($migration in $migrationFiles) {
        $version = $migration.Name
        $escapedVersion = $version.Replace("'", "''")
        $checkSql = "SELECT COUNT(*) FROM _schema_migrations WHERE version = '$escapedVersion';"
        $applied = Invoke-ClientCommand -ClientPath $client -ExtraArgs @("--batch", "--skip-column-names", "-e", $checkSql)
        if ($LASTEXITCODE -ne 0) {
            $err = 'Failed checking migration state for ' + $version + '.'
            throw $err
        }

        if (($applied | Select-Object -First 1) -eq "1") {
            Write-Host ('SKIP: ' + $version + ' already applied.')
            continue
        }

        Invoke-SqlFile -Client $client -Path $migration.FullName -Label "APPLY"

        $insertSql = "INSERT INTO _schema_migrations (version) VALUES ('$escapedVersion');"
        Invoke-ClientCommand -ClientPath $client -ExtraArgs @("-e", $insertSql)

        if ($LASTEXITCODE -ne 0) {
            $err = 'Failed recording migration: ' + $version
            throw $err
        }
    }
} finally {
    if (Test-Path -LiteralPath $tempCnf) {
        Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
    }
}
