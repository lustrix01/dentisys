param(
    [string] $HostName,
    [int] $Port = 0,
    [string] $DatabaseName,
    [string] $User,
    [string] $Password,
    [string] $MysqlCommand,
    [switch] $ResetDatabase
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDir = Join-Path $root "database\migrations"
$portWasProvided = $PSBoundParameters.ContainsKey("Port")

function Get-TrimmedString {
    param([object] $Value)
    if ($null -eq $Value) { return "" }
    return ([string] $Value).Trim()
}

function Test-CountIsZero {
    param([string] $Val)
    if ([string]::IsNullOrWhiteSpace($Val)) { return $true }
    return ($Val -eq "0")
}

function Test-CountIsNonZero {
    param([string] $Val)
    if ([string]::IsNullOrWhiteSpace($Val)) { return $false }
    return ($Val -ne "0")
}

function Get-DbAuthArgs {
    param(
        [string] $TargetDb = ""
    )
    $argsList = @("-h", $HostName, "-P", "$Port", "-u", $User)
    if (![string]::IsNullOrEmpty($Password)) {
        $argsList += "-p$Password"
    }
    if (![string]::IsNullOrEmpty($TargetDb)) {
        $argsList += $TargetDb
    }
    return $argsList
}

function Read-EnvFile {
    param([string] $Path)

    $values = @{}
    if (!(Test-Path -LiteralPath $Path)) {
        return $values
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = Get-TrimmedString $_
        if ($line -eq "" -or $line.StartsWith("#") -or !$line.Contains("=")) {
            return
        }

        $parts = $line.Split("=", 2)
        $key = Get-TrimmedString $parts[0]
        $val = Get-TrimmedString $parts[1]
        $val = $val.Trim('"').Trim("'")
        if ($key -ne "") {
            $values[$key] = $val
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
        $errText = 'Database client ' + $RequestedCommand + ' is unavailable.'
        throw $errText
    }

    foreach ($candidate in @("mariadb", "mysql", "C:\xampp\mysql\bin\mysql.exe")) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }

    throw "No supported database client is available. Install or expose mariadb/mysql, or use XAMPP's mysql client."
}

function Exec-DbQuery {
    param(
        [string] $Client,
        [string] $Sql
    )
    $auth = Get-DbAuthArgs -TargetDb $DatabaseName
    $cmdArgs = $auth + @("--batch", "--skip-column-names", "-e", $Sql)
    $output = & $Client @cmdArgs 2>$null
    return $output
}

function Invoke-Database {
    param(
        [string] $Client,
        [string[]] $ExtraArgs
    )

    $baseArgs = Get-DbAuthArgs -TargetDb $DatabaseName
    & $Client @baseArgs @ExtraArgs
    if ($LASTEXITCODE -ne 0) {
        $errText = 'Database command failed against ' + $HostName + ':' + $Port + '/' + $DatabaseName
        throw $errText
    }
}

$envFile = Read-EnvFile (Join-Path $root ".env")

if (!$PSBoundParameters.ContainsKey("HostName")) {
    $HostName = Resolve-Setting "DB_HOST" $null $envFile "127.0.0.1"
}
if (!$PSBoundParameters.ContainsKey("DatabaseName")) {
    $DatabaseName = Resolve-Setting "DB_NAME" $null $envFile "dentisys"
}
if (!$PSBoundParameters.ContainsKey("User")) {
    $User = Resolve-Setting "DB_USER" $null $envFile "root"
}
if (!$PSBoundParameters.ContainsKey("Password")) {
    $Password = Resolve-Setting "DB_PASS" $null $envFile ""
}
$Port = Resolve-DbPort $envFile

if ([string]::IsNullOrWhiteSpace($HostName)) { $HostName = "127.0.0.1" }
if ([string]::IsNullOrWhiteSpace($DatabaseName)) { $DatabaseName = "dentisys" }
if ([string]::IsNullOrWhiteSpace($User)) { $User = "root" }
if ($null -eq $Password) { $Password = "" }

$client = Resolve-DatabaseClient $MysqlCommand

Write-Host "Resolved database target: host=$HostName port=$Port database=$DatabaseName user=$User password=<redacted>"

if ($ResetDatabase) {
    Write-Host "Resetting database target: $DatabaseName"
    $dbAuth = Get-DbAuthArgs -TargetDb $DatabaseName
    $tables = & $client @dbAuth "--batch" "--skip-column-names" "-e" "SHOW TABLES;" 2>$null
    if ($LASTEXITCODE -eq 0 -and $tables) {
        & $client @dbAuth "-e" "SET FOREIGN_KEY_CHECKS = 0;" 2>$null
        foreach ($tbl in $tables) {
            $tName = Get-TrimmedString $tbl
            if ($tName -ne "") {
                & $client @dbAuth "-e" "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS `$tName`;" 2>$null
            }
        }
        & $client @dbAuth "-e" "SET FOREIGN_KEY_CHECKS = 1;" 2>$null
    }

    $xamppPath = "C:\xampp\mysql\data\$DatabaseName"
    if (Test-Path $xamppPath) {
        try {
            Remove-Item -Path "$xamppPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        } catch {}
    }

    $noDbAuth = Get-DbAuthArgs
    & $client @noDbAuth "-e" "DROP DATABASE IF EXISTS $DatabaseName; CREATE DATABASE $DatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>$null
} else {
    $noDbAuth = Get-DbAuthArgs
    & $client @noDbAuth "-e" "CREATE DATABASE IF NOT EXISTS $DatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>$null
}

# ---- Migration preflight ----
$activeVersions = @(
    "001_baseline_schema.sql",
    "002_seed_rbac.sql",
    "003_seed_system_settings.sql"
)

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

$targetTables = @(
    "user_accounts", "role_permissions", "students", "class_sections",
    "courses", "enrollments", "assessments", "assessment_scores",
    "attendance_records", "biometric_profiles", "auth_sessions",
    "security_tokens", "audit_events", "email_outbox", "system_settings"
)

function Invoke-MigrationPreflight {
    param(
        [string] $Client,
        [string] $HostName,
        [int] $Port,
        [string] $User,
        [string] $Password,
        [string] $DatabaseName,
        [string[]] $ActiveVersions,
        [string[]] $LegacyTablePatterns,
        [string[]] $TargetTables
    )

    $schemaTableExists = $false
    $migrationInfo = @{}
    try {
        $checkSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='_schema_migrations';"
        $count = Exec-DbQuery $Client $checkSql
        $cVal = Get-TrimmedString $count
        if (Test-CountIsNonZero $cVal) {
            $schemaTableExists = $true

            $rows = Exec-DbQuery $Client "SELECT version FROM _schema_migrations ORDER BY version;"
            if ($rows) {
                foreach ($row in $rows) {
                    $v = Get-TrimmedString $row
                    if ($v -ne "") { $migrationInfo[$v] = $true }
                }
            }
        }
    } catch {
        # Database may not exist yet.
    }

    if (!$schemaTableExists) {
        foreach ($tbl in $TargetTables) {
            try {
                $checkTblSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$tbl';"
                $tcount = Exec-DbQuery $Client $checkTblSql
                $tVal = Get-TrimmedString $tcount
                if (Test-CountIsNonZero $tVal) {
                    $errText = 'Target table ' + $tbl + ' already exists in database ' + $DatabaseName + ' but no baseline migration record was found.'
                    throw $errText
                }
            } catch {
                $eMsg = Get-TrimmedString $_.Exception.Message
                if ($eMsg -like '*Target table*') { throw }
            }
        }

        foreach ($pattern in $LegacyTablePatterns) {
            try {
                $checkLegSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$pattern';"
                $lcount = Exec-DbQuery $Client $checkLegSql
                $lVal = Get-TrimmedString $lcount
                if (Test-CountIsNonZero $lVal) {
                    $errText = 'Legacy table ' + $pattern + ' found in database ' + $DatabaseName + '.'
                    throw $errText
                }
            } catch {
                $eMsg = Get-TrimmedString $_.Exception.Message
                if ($eMsg -like '*Legacy*' -or $eMsg -like '*Target table*') { throw }
            }
        }

        Write-Host "PASS: Preflight - clean database. Proceeding with baseline."
        return
    }

    $recordedKeys = $migrationInfo.Keys
    $legacyRecordFound = $false
    foreach ($key in $recordedKeys) {
        if ($ActiveVersions -notcontains $key) {
            Write-Host "ERROR: Migration version $key is not part of current baseline."
            $legacyRecordFound = $true
        }
    }
    if ($legacyRecordFound) {
        throw "Legacy migration records found. Create a fresh database or reset _schema_migrations."
    }

    $appliedSet = @()
    foreach ($av in $ActiveVersions) {
        if ($migrationInfo.ContainsKey($av)) {
            $appliedSet += $av
        }
    }

    if ($appliedSet.Count -gt 0) {
        $expectedTables = @()
        foreach ($av in $appliedSet) {
            if ($av -eq "001_baseline_schema.sql") { $expectedTables = $TargetTables }
        }

        if ($expectedTables.Count -gt 0) {
            foreach ($tbl in $expectedTables) {
                try {
                    $checkTblSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$tbl';"
                    $tcount = Exec-DbQuery $Client $checkTblSql
                    $tVal = Get-TrimmedString $tcount
                    if (Test-CountIsZero $tVal) {
                        $errText = 'Expected table ' + $tbl + ' not found in database ' + $DatabaseName + '.'
                        throw $errText
                    }
                } catch {
                    $eMsg = Get-TrimmedString $_.Exception.Message
                    if ($eMsg -like '*Expected table*') { throw }
                }
            }
        }

        foreach ($pattern in $LegacyTablePatterns) {
            try {
                $checkLegSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$pattern';"
                $lcount = Exec-DbQuery $Client $checkLegSql
                $lVal = Get-TrimmedString $lcount
                if (Test-CountIsNonZero $lVal) {
                    $errText = 'Legacy table ' + $pattern + ' found alongside current baseline migrations.'
                    throw $errText
                }
            } catch {
                $eMsg = Get-TrimmedString $_.Exception.Message
                if ($eMsg -like '*Legacy*') { throw }
            }
        }
    }

    Write-Host "PASS: Preflight - database is in a valid current-baseline state."
}

Invoke-MigrationPreflight -Client $client -HostName $HostName -Port $Port -User $User -Password $Password -DatabaseName $DatabaseName -ActiveVersions $activeVersions -LegacyTablePatterns $legacyTablePatterns -TargetTables $targetTables

# ---- End migration preflight ----

$schemaSql = @"
CREATE TABLE IF NOT EXISTS _schema_migrations (
    version VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"@

Invoke-Database $client @("-e", $schemaSql)

$migrations = Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Sort-Object Name

if ($migrations.Count -eq 0) {
    Write-Host "No SQL migration files found."
    exit 0
}

$dbAuthForRun = Get-DbAuthArgs -TargetDb $DatabaseName

foreach ($migration in $migrations) {
    $version = $migration.Name
    $escapedVersion = $version.Replace("'", "''")
    $checkSql = "SELECT COUNT(*) FROM _schema_migrations WHERE version = '$escapedVersion';"
    $applied = Exec-DbQuery $client $checkSql
    $appVal = Get-TrimmedString $applied
    if (Test-CountIsNonZero $appVal) {
        Write-Host "SKIP: $version already applied."
        continue
    }

    Write-Host "APPLY: $version"
    Get-Content -LiteralPath $migration.FullName | & $client @dbAuthForRun

    if ($LASTEXITCODE -ne 0) {
        $errText = 'Migration failed: ' + $version
        throw $errText
    }

    $insertSql = "INSERT INTO _schema_migrations (version) VALUES ('$escapedVersion');"
    & $client @dbAuthForRun "-e" $insertSql

    if ($LASTEXITCODE -ne 0) {
        $errText = 'Failed recording migration: ' + $version
        throw $errText
    }
}
