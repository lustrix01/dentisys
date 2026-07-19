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
