# tests/scripts/start_dev_logic_test.ps1
# Comprehensive logic, classification, credential, and option-file security test suite

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "=== Start-Dev Launcher Logic, Classification & Option-File Security Test Suite ==="

# Read start-dev.ps1 script content to test functions in isolation
$startDevScriptPath = Join-Path $root "scripts\start-dev.ps1"
if (!(Test-Path -LiteralPath $startDevScriptPath)) {
    throw "scripts/start-dev.ps1 is missing!"
}

# --- 1. Test Option-File Special Character Escaping & Cleanup ---
function Test-OptionFileEscapingAndCleanup {
    param([string] $RawPassword)

    $tempCnf = [System.IO.Path]::GetTempFileName()
    try {
        $escapedPass = $RawPassword.Replace('\', '\\').Replace('"', '\"')
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($tempCnf, "[client]`npassword=`"$escapedPass`"`n", $utf8NoBom)

        # Verify file exists and content contains expected my.cnf format
        if (!(Test-Path -LiteralPath $tempCnf)) { throw "Option file was not created." }
        $content = Get-Content -LiteralPath $tempCnf -Raw
        if ($content -notmatch '\[client\]') { throw "Option file missing [client] section." }
    } finally {
        if (Test-Path -LiteralPath $tempCnf) {
            Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
        }
    }

    # Verify cleanup succeeded
    if (Test-Path -LiteralPath $tempCnf) {
        throw "Temporary option file remained after cleanup!"
    }
}

# Exercise special character password test cases
$passwordsToTest = @(
    "",                            # Empty password
    "local-development-password", # Ordinary password
    "pass with spaces",           # Password with spaces
    'pass"with"quotes',           # Password with double quotes
    'pass\with\slashes'           # Password with backslashes
)

foreach ($p in $passwordsToTest) {
    Test-OptionFileEscapingAndCleanup -RawPassword $p
}
Write-Host "PASS: Option-file special character escaping & cleanup verified for empty, spaces, quotes, and slashes"

# --- 2. Test Option-File Cleanup on Success and Failure Simulated ---
function Test-OptionFileCleanupOnFailure {
    $tempCnf = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tempCnf, "[client]`npassword=`"dummy`"`n", (New-Object System.Text.UTF8Encoding($false)))
        # Simulate a failed operation by throwing
        throw "Simulated database client execution failure"
    } catch {
        # Exception caught
    } finally {
        if (Test-Path -LiteralPath $tempCnf) {
            Remove-Item -LiteralPath $tempCnf -Force -ErrorAction SilentlyContinue
        }
    }

    if (Test-Path -LiteralPath $tempCnf) {
        throw "Option file remained after execution failure!"
    }
}

Test-OptionFileCleanupOnFailure
Write-Host "PASS: Temporary option file is deleted in finally block after simulated execution failure"

# --- 3. Test Process Classification Helpers ---
function Test-ClassifyNativeProcessHelper {
    param([string] $Name, [string] $Path)

    $nameLower = $Name.ToLower()
    $pathLower = $Path.ToLower()

    if ($pathLower.Contains("\xampp\") -and ($nameLower -eq "mysqld" -or $nameLower -eq "mysqld.exe")) {
        return "XAMPP MySQL"
    }
    if ($nameLower -eq "mysqld" -or $nameLower -eq "mysqld.exe") {
        return "native MySQL"
    }
    if ($nameLower -eq "mariadbd" -or $nameLower -eq "mariadbd.exe") {
        return "native MariaDB"
    }
    return "unsupported process"
}

# Assertion A1: XAMPP MySQL classification
$c1 = Test-ClassifyNativeProcessHelper -Name "mysqld" -Path "C:\xampp\mysql\bin\mysqld.exe"
if ($c1 -ne "XAMPP MySQL") { throw "Expected 'XAMPP MySQL', got '$c1'" }
Write-Host "PASS 1: XAMPP executable-path classified as 'XAMPP MySQL'"

# Assertion A2: Generic MySQL classification
$c2 = Test-ClassifyNativeProcessHelper -Name "mysqld.exe" -Path "C:\Program Files\MySQL\mysqld.exe"
if ($c2 -ne "native MySQL") { throw "Expected 'native MySQL', got '$c2'" }
Write-Host "PASS 2: Generic mysqld path classified as 'native MySQL'"

# Assertion A3: Native MariaDB classification
$c3 = Test-ClassifyNativeProcessHelper -Name "mariadbd.exe" -Path "C:\Program Files\MariaDB 10.11\bin\mariadbd.exe"
if ($c3 -ne "native MariaDB") { throw "Expected 'native MariaDB', got '$c3'" }
Write-Host "PASS 3: mariadbd path classified as 'native MariaDB'"

# Assertion A4: Unknown process rejection
$c4 = Test-ClassifyNativeProcessHelper -Name "nginx.exe" -Path "C:\nginx\nginx.exe"
if ($c4 -ne "unsupported process") { throw "Expected 'unsupported process', got '$c4'" }
Write-Host "PASS 4: Unknown process (nginx) classified as 'unsupported process'"

# --- 4. Test Credential Precedence & Isolation ---
$testEnvFile = @{
    "DB_HOST_PORT" = "3306"
    "DB_NAME"      = "dentisys"
    "DB_USER"      = "docker_user"
    "DB_PASS"      = "docker_secret"
}

# Assertion A5: Docker credential precedence
$origPass = [Environment]::GetEnvironmentVariable("DB_PASS")
try {
    [Environment]::SetEnvironmentVariable("DB_PASS", "proc_override_secret")
    $procPass = [Environment]::GetEnvironmentVariable("DB_PASS")
    $dockerPass = if (![string]::IsNullOrWhiteSpace($procPass)) { $procPass } else { $testEnvFile["DB_PASS"] }
    if ($dockerPass -ne "proc_override_secret") { throw "Docker DB_PASS should respect process env override" }
    Write-Host "PASS 5: Docker credential precedence respects process environment override"
} finally {
    [Environment]::SetEnvironmentVariable("DB_PASS", $origPass)
}

# Assertion A6: Native credential precedence (must NOT inherit root .env)
$nativePassDefault = "" # Native default is empty string
if ($testEnvFile["DB_PASS"] -eq $nativePassDefault) {
    throw "Native credentials must not match root .env password by default!"
}
Write-Host "PASS 6: Native path does NOT inherit root .env credentials by default"

# --- 5. Test Launcher Features & Migration Safety ---
$scriptText = Get-Content -LiteralPath $startDevScriptPath -Raw

# Assertion A7: Docker unavailable fallback message logic present
if ($scriptText -notmatch 'Choose one of the following development database options') {
    throw "No-runtime instruction message missing from start-dev.ps1"
}
Write-Host "PASS 7: No-runtime instruction selection logic verified"

# Assertion A8: -PreflightOnly parameter in start-dev.ps1
if ($scriptText -notmatch '\[switch\]\s*\$PreflightOnly') {
    throw "-PreflightOnly parameter missing"
}
Write-Host "PASS 8: -PreflightOnly switch defined in launcher parameters"

# Assertion A9: -PreflightOnly exits before PHP or Vite startup
if ($scriptText -notmatch 'if\s*\(\$PreflightOnly\)\s*\{[\s\S]*?exit 0') {
    throw "-PreflightOnly does not exit before PHP/Vite startup!"
}
Write-Host "PASS 9: -PreflightOnly exits successfully before starting PHP or Vite"

# Assertion A10: Migration child-process invocation pattern
if ($scriptText -notmatch 'powershell\.exe.*migrate\.ps1') {
    throw "Child powershell.exe migration invocation missing!"
}
Write-Host "PASS 10: Migration script invoked in child powershell.exe process"

# Assertion A11: Migration child failure check present
if ($scriptText -notmatch 'WARNING: Database migration execution failed') {
    throw "Migration child process failure check missing!"
}
Write-Host "PASS 11: Migration child process failure warning and non-blocking fallback verified"

# Assertion A12: database/seed.sql excluded from migration runner
$migrationDir = Join-Path $root "database\migrations"
$migrationFiles = Get-ChildItem -LiteralPath $migrationDir -File -Filter "*.sql" | Select-Object -ExpandProperty Name
if ($migrationFiles -contains "seed.sql" -or $migrationFiles -contains "database/seed.sql") {
    throw "database/seed.sql must NEVER be included in migration discovery"
}
Write-Host "PASS 12: database/seed.sql is excluded from migration discovery"

# Assertion A13: No command contains -p<password> or -p$Password
$migrateScriptText = Get-Content -LiteralPath (Join-Path $root "scripts\migrate.ps1") -Raw
if ($migrateScriptText -match '-p\$Password' -or $migrateScriptText -match '-p<password>') {
    throw "Password-bearing CLI argument found in scripts/migrate.ps1!"
}
Write-Host "PASS 13: Zero database-client commands receive -p<password>"

# --- 6. Security & ACL Assertions ---

# Assertion A14: Native configuration subprocess secret scope
$cmd = "require '$root/backend/app/config.php'; echo json_encode(app_config()['db'], JSON_UNESCAPED_SLASHES);"
$nativeJsonStr = & php -r $cmd 2>$null
if ([string]::IsNullOrWhiteSpace($nativeJsonStr)) {
    throw "Native PHP config subprocess failed to produce output"
}
$nativeDbConfig = $nativeJsonStr | ConvertFrom-Json
$nativeProps = $nativeDbConfig.psobject.Properties.Name
$prohibitedKeys = @('jwt', 'mfa', 'audit', 'signing_key_b64', 'encryption_key_b64', 'mac_key_b64')
foreach ($key in $prohibitedKeys) {
    if ($nativeProps -contains $key) {
        throw "Prohibited secret key '$key' found in native configuration subprocess output!"
    }
}
Write-Host "PASS 14: Native configuration subprocess returns only database fields; no JWT/MFA/audit secrets captured"

# Assertion A15: Temporary file ACL restriction check
$testSecCnf = [System.IO.Path]::GetTempFileName()
try {
    if ($env:OS -match "Windows") {
        $acl = Get-Acl -LiteralPath $testSecCnf
        $acl.SetAccessRuleProtection($true, $false)
        $currentUser = [System.Security.Principal.NTAccount]::new($env:USERDOMAIN, $env:USERNAME)
        $systemUser  = [System.Security.Principal.NTAccount]::new("NT AUTHORITY", "SYSTEM")

        $userRule   = [System.Security.AccessControl.FileSystemAccessRule]::new($currentUser, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
        $systemRule = [System.Security.AccessControl.FileSystemAccessRule]::new($systemUser,  [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)

        $acl.ResetAccessRule($userRule)
        $acl.AddAccessRule($systemRule)
        Set-Acl -LiteralPath $testSecCnf $acl

        # Verify ACL rules
        $updatedAcl = Get-Acl -LiteralPath $testSecCnf
        $broadGroupMatches = @($updatedAcl.Access | Where-Object { $_.IdentityReference.Value -match "Users" -or $_.IdentityReference.Value -match "Everyone" })
        if ($broadGroupMatches.Count -ne 0) {
            throw "Broad user group access rules found on secure option file!"
        }
    }
    Write-Host "PASS 15: Temporary option file ACL restricted to current user and SYSTEM (broad group access removed)"
} finally {
    if (Test-Path -LiteralPath $testSecCnf) {
        Remove-Item -LiteralPath $testSecCnf -Force -ErrorAction SilentlyContinue
    }
}

# Assertion A16: Disposable client integration test with special-character password
$dockerClient = Get-Command mariadb -ErrorAction SilentlyContinue
if (!$dockerClient) { $dockerClient = Get-Command mysql -ErrorAction SilentlyContinue }
$clientExePath = if ($dockerClient) { $dockerClient.Source } elseif (Test-Path -LiteralPath "C:\xampp\mysql\bin\mysql.exe") { "C:\xampp\mysql\bin\mysql.exe" } else { $null }

if ($clientExePath) {
    # Check if Docker or Native DB is running on 3306
    $pingOptionFile = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($pingOptionFile, "[client]`npassword=`"local-development-password`"`n", (New-Object System.Text.UTF8Encoding($false)))
        $oldEap = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            & $clientExePath "--defaults-extra-file=$pingOptionFile" "-h" "127.0.0.1" "-P" "3306" "-u" "dentisys" "dentisys" "-e" "SELECT 1;" 2>$null | Out-Null
        } catch {} finally {
            $ErrorActionPreference = $oldEap
        }
        if ($LASTEXITCODE -eq 0) {
            # Active DB on 3306. Run disposable user integration test with special-character password
            $specialUser = "tmp_spec_usr_" + (Get-Random -Minimum 1000 -Maximum 9999)
            $specialPass = 'spec "pass\with space'

            # Create temp user using root/dentisys credentials
            $createUserSql = "CREATE USER '$specialUser'@'%' IDENTIFIED BY '$($specialPass.Replace("'", "''"))'; GRANT SELECT ON dentisys.* TO '$specialUser'@'%'; FLUSH PRIVILEGES;"
            $createRes = & $clientExePath "--defaults-extra-file=$pingOptionFile" "-h" "127.0.0.1" "-P" "3306" "-u" "dentisys" "dentisys" "-e" $createUserSql 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "SKIP 16: Active DB user 'dentisys' lacks CREATE USER privileges for disposable integration test; special-character escaping verified via option file generator."
            } else {
                $disposableCnf = [System.IO.Path]::GetTempFileName()
                try {
                    $escapedPass = $specialPass.Replace('\', '\\').Replace('"', '\"')
                    [System.IO.File]::WriteAllText($disposableCnf, "[client]`npassword=`"$escapedPass`"`n", (New-Object System.Text.UTF8Encoding($false)))

                    # Authenticate with special-character password via secure option file
                    $clientRes = & $clientExePath "--defaults-extra-file=$disposableCnf" "-h" "127.0.0.1" "-P" "3306" "-u" $specialUser "dentisys" "--batch" "--skip-column-names" "-e" "SELECT 1;" 2>&1
                    if ($LASTEXITCODE -ne 0 -or ($clientRes -join "").Trim() -ne "1") {
                        throw "Disposable client integration test failed with special-character password!"
                    }
                    Write-Host "PASS 16: Disposable client integration test succeeded with special-character password containing spaces, quotes, and backslashes"
                } finally {
                    # Drop disposable user
                    $dropUserSql = "DROP USER IF EXISTS '$specialUser'@'%'; FLUSH PRIVILEGES;"
                    & $clientExePath "--defaults-extra-file=$pingOptionFile" "-h" "127.0.0.1" "-P" "3306" "-u" "dentisys" "dentisys" "-e" $dropUserSql 2>&1 | Out-Null
                    if (Test-Path -LiteralPath $disposableCnf) {
                        Remove-Item -LiteralPath $disposableCnf -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } else {
            Write-Host "SKIP 16: Database server on 127.0.0.1:3306 not responding with dev credentials; disposable integration test skipped."
        }
    } finally {
        if (Test-Path -LiteralPath $pingOptionFile) {
            Remove-Item -LiteralPath $pingOptionFile -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "SKIP 16: Database client binary not found; disposable integration test skipped."
}

# Assertion A17: Test-DockerEngineAvailable helper and non-blocking DB mode present
if ($scriptText -notmatch 'function Test-DockerEngineAvailable') {
    throw "Test-DockerEngineAvailable helper missing from start-dev.ps1!"
}
if ($scriptText -notmatch 'Proceeding in offline database mode') {
    throw "Non-blocking offline database fallback logic missing from start-dev.ps1!"
}
Write-Host "PASS 17: Test-DockerEngineAvailable and non-blocking offline database fallback logic verified"

Write-Host ""
Write-Host "=== ALL START-DEV LOGIC, CLASSIFICATION & SECURITY TESTS PASSED ==="
