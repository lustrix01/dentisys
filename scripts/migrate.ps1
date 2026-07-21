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

    return 3307
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

function Invoke-Database {
    param(
        [string] $Client,
        [string[]] $ExtraArgs
    )

    $baseArgs = @("-h", $HostName, "-P", "$Port", "-u", $User, "-p$Password", $DatabaseName)
    & $Client @baseArgs @ExtraArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Database command failed against $HostName`:$Port/$DatabaseName as $User."
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

Write-Host "Resolved database target: host=$HostName port=$Port database=$DatabaseName user=$User password=<redacted>"

# ---- Migration preflight ----
# The current baseline consists of exactly three migration files.
$activeVersions = @(
    "001_baseline_schema.sql",
    "002_seed_rbac.sql",
    "003_seed_system_settings.sql"
)

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
        [string] $HostName,
        [int] $Port,
        [string] $User,
        [string] $Password,
        [string] $DatabaseName,
        [string[]] $ActiveVersions,
        [string[]] $LegacyTablePatterns,
        [string[]] $TargetTables
    )

    # Determine whether the database is accessible and has a _schema_migrations table.
    $schemaTableExists = $false
    $migrationInfo = @{}
    try {
        $checkSql = "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='_schema_migrations';"
        $count = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" $checkSql 2>$null
        if ($LASTEXITCODE -eq 0 -and "$count".Trim() -eq "1") {
            $schemaTableExists = $true

            # Read recorded migrations.
            $rows = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" "SELECT version FROM _schema_migrations ORDER BY version;" 2>$null
            if ($LASTEXITCODE -eq 0 -and $rows) {
                foreach ($row in $rows) {
                    $v = $row.Trim()
                    if ($v -ne "") { $migrationInfo[$v] = $true }
                }
            }
        }
    } catch {
        # Database may not exist yet. That is acceptable.
    }

    # If no schema_migrations table exists, check whether any target tables exist.
    if (-not $schemaTableExists) {
        foreach ($tbl in $TargetTables) {
            try {
                $tcount = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$tbl';" 2>$null
                if ($LASTEXITCODE -eq 0 -and "$tcount".Trim() -ne "0") {
                    throw "Target table '$tbl' already exists in database '$DatabaseName' but no baseline migration record was found. The new baseline is clean-install only. Create a fresh database or drop all existing objects first."
                }
            } catch {
                if ($_.Exception.Message -match "Target table") { throw }
            }
        }

        # Check for legacy business tables.
        foreach ($pattern in $LegacyTablePatterns) {
            try {
                $lcount = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$pattern';" 2>$null
                if ($LASTEXITCODE -eq 0 -and "$lcount".Trim() -ne "0") {
                    throw "Legacy '$pattern' table found in database '$DatabaseName'. The new baseline is clean-install only. Create a fresh database or drop all existing objects first."
                }
            } catch {
                if ($_.Exception.Message -match "Legacy|Target table") { throw }
            }
        }

        Write-Host "PASS: Preflight — clean database. Proceeding with baseline."
        return
    }

    # Schema_migrations table exists.  Check for legacy migration records.
    $recordedKeys = $migrationInfo.Keys
    $legacyRecordFound = $false
    foreach ($key in $recordedKeys) {
        if ($ActiveVersions -notcontains $key) {
            Write-Host "ERROR: Migration version '$key' is not part of the current baseline."
            Write-Host "       The new baseline is clean-install only."
            Write-Host "       Recorded versions: $($recordedKeys -join ', ')"
            Write-Host "       Expected active versions: $($ActiveVersions -join ', ')"
            $legacyRecordFound = $true
        }
    }
    if ($legacyRecordFound) {
        throw "Legacy migration records found. Create a fresh database or reset _schema_migrations and drop all existing objects."
    }

    # Check that recorded versions form a valid ordered prefix.
    $appliedSet = @()
    foreach ($av in $ActiveVersions) {
        if ($migrationInfo.ContainsKey($av)) {
            $appliedSet += $av
        }
    }

    if ($appliedSet.Count -gt 0) {
        # Confirm that all schema objects for applied versions exist.
        $expectedTables = @()
        foreach ($av in $appliedSet) {
            if ($av -eq "001_baseline_schema.sql") { $expectedTables = $TargetTables }
        }

        if ($expectedTables.Count -gt 0) {
            foreach ($tbl in $expectedTables) {
                try {
                    $tcount = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$tbl';" 2>$null
                    if ($LASTEXITCODE -eq 0 -and "$tcount".Trim() -eq "0") {
                        throw "Expected table '$tbl' (from applied migration '$av') not found in database '$DatabaseName'."
                    }
                } catch {
                    if ($_.Exception.Message -match "Expected table") { throw }
                }
            }
        }

        # Check no target tables exist without a corresponding baseline record.
        # (Already covered by the applied-versions check above, but also check for unknown business tables.)
        foreach ($pattern in $LegacyTablePatterns) {
            try {
                $lcount = & $Client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DatabaseName' AND TABLE_NAME='$pattern';" 2>$null
                if ($LASTEXITCODE -eq 0 -and "$lcount".Trim() -ne "0") {
                    throw "Legacy table '$pattern' found alongside current baseline migrations. The database is in an inconsistent state. Create a fresh database."
                }
            } catch {
                if ($_.Exception.Message -match "Legacy") { throw }
            }
        }
    }

    Write-Host "PASS: Preflight — database is in a valid current-baseline state."
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

$baseArgs = @("-h", $HostName, "-P", $Port, "-u", $User, "-p$Password", $DatabaseName)

foreach ($migration in $migrations) {
    $version = $migration.Name
    $escapedVersion = $version.Replace("'", "''")
    $checkSql = "SELECT COUNT(*) FROM _schema_migrations WHERE version = '$escapedVersion';"
    $applied = & $client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "--batch" "--skip-column-names" "-e" $checkSql
    if ($LASTEXITCODE -ne 0) { throw "Failed checking migration state for $version." }

    if (($applied | Select-Object -First 1) -eq "1") {
        Write-Host "SKIP: $version already applied."
        continue
    }

    Write-Host "APPLY: $version"
    Get-Content -LiteralPath $migration.FullName | & $client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName

    if ($LASTEXITCODE -ne 0) {
        throw "Migration failed: $version"
    }

    $insertSql = "INSERT INTO _schema_migrations (version) VALUES ('$escapedVersion');"
    & $client "-h" $HostName "-P" "$Port" "-u" $User "-p$Password" $DatabaseName "-e" $insertSql

    if ($LASTEXITCODE -ne 0) {
        throw "Failed recording migration: $version"
    }
}
