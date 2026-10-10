[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\z')]
    [string]$Ip,
    [Parameter(Mandatory = $true)]
    [string]$KeyFile,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]\z')]
    [string]$Domain,
    [ValidateRange(1024, 65535)]
    [int]$SshPort = 2202,
    [switch]$NoDbTunnel,
    [switch]$NewInstance
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$address = $null
if (-not [Net.IPAddress]::TryParse($Ip, [ref]$address) -or $address.ToString() -ne $Ip) { throw 'Ip must be an IPv4 address.' }
if ($Domain -and $Domain -notmatch '\.') { throw 'Domain must be a hostname, without a scheme, port or path.' }
function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    $nativePreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Command @Arguments
        $nativeExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $nativePreference }
    if ($nativeExit -ne 0) { throw "$Command failed (exit $nativeExit)." }
}
# Standard Windows argv quoting. Credentials are never included in Arguments.
function Quote-NativeArgument {
    param([string]$Value)
    if ($Value -notmatch '[\s"]' -and $Value -ne '') { return $Value }
    return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}
# Only public probe/key metadata uses this helper. Drain both pipes concurrently.
function Invoke-CapturedNative {
    param([string]$Command, [string[]]$Arguments, [string]$InputText = '')
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = @(Get-Command $Command -CommandType Application)[0].Source
    $start.Arguments = ($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8
    $start.StandardErrorEncoding = [Text.Encoding]::UTF8
    $child = New-Object Diagnostics.Process
    $child.StartInfo = $start
    try {
        if (-not $child.Start()) { throw "Unable to start $Command." }
        $stdout = $child.StandardOutput.ReadToEndAsync()
        $stderr = $child.StandardError.ReadToEndAsync()
        if ($InputText) { $child.StandardInput.Write($InputText) }
        $child.StandardInput.Close()
        $child.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $child.ExitCode
            Output = $stdout.GetAwaiter().GetResult()
            Error = $stderr.GetAwaiter().GetResult()
        }
    }
    finally { $child.Dispose() }
}
function Show-ProbeFailure {
    param([string]$LoginUser, [int]$Port, $Result)
    $target = "${LoginUser}@${Ip}:$Port"
    $detail = $Result.Error.Trim()
    if ($detail -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed') {
        Write-Host "SSH $target : host key changed or could not be verified. Stop and verify the replacement instance's host key."
        if ($detail) { Write-Host $detail }
        throw "If you rebuilt this instance on the same IP, rerun: $newInstanceCommand"
    }
    elseif ($detail -match '(?i)timed out|no route to host|network is unreachable') {
        Write-Host "SSH $target : connection timed out or unreachable. Check that the instance is running, the IP is correct, and the Security Group/network firewall allows TCP $Port from your IP."
    }
    elseif ($detail -match '(?i)connection refused') {
        Write-Host "SSH $target : connection refused. The host is reachable but nothing accepts SSH on TCP $Port; check the SSH listener and port."
    }
    elseif ($detail -match '(?i)permission denied') {
        Write-Host "SSH $target : permission denied. Check the key pair/private key and login user ($LoginUser)."
    }
    else { Write-Host "SSH $target : probe failed (exit $($Result.ExitCode))." }
    if ($detail) { Write-Host $detail }
}
function Invoke-SshProbe {
    param([string]$LoginUser, [int]$Port)
    $result = Invoke-CapturedNative 'ssh' ($keyArgs + @('-T', '-p', "$Port", "$LoginUser@$Ip", $probeCommand))
    if ($result.ExitCode -ne 0) { Show-ProbeFailure $LoginUser $Port $result }
    return $result
}
function Reset-InstanceHostKeys {
    $scanned = $false
    foreach ($port in @(22, $SshPort)) {
        $scan = Invoke-CapturedNative 'ssh-keyscan' @('-T', '5', '-p', "$port", '-t', 'ed25519,ecdsa,rsa', $Ip)
        if (-not $scan.Output.Trim()) {
            Write-Host "No host key obtained on TCP $port (the other SSH port may be the active listener)."
            if ($scan.Error.Trim()) { Write-Host $scan.Error.Trim() }
            continue
        }
        $fingerprints = Invoke-CapturedNative 'ssh-keygen' @('-l', '-f', '-') $scan.Output
        if ($fingerprints.ExitCode -ne 0) { throw "Could not fingerprint the scanned host keys: $($fingerprints.Error.Trim())" }
        $scanned = $true
        Write-Host "New SSH host key fingerprints for ${Ip}:$port :"
        Write-Host $fingerprints.Output.Trim()
    }
    if (-not $scanned) { throw 'No replacement host key was obtained. Check the instance, IP and Security Group; known_hosts was left unchanged.' }
    Write-Host 'Compare these fingerprints with the EC2 console: Actions > Monitor and troubleshoot > Get system log > BEGIN SSH HOST KEY FINGERPRINTS.'
    Write-Host 'Cancel if they do not match. -NewInstance removes the old entries; the next connection accepts the newly presented key.'
    Invoke-Native 'ssh-keygen' @('-R', $Ip)
    Invoke-Native 'ssh-keygen' @('-R', "[$Ip]:$SshPort")
}
Push-Location $repoRoot
try {
    $dirty = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Test and commit a clean working tree before provisioning; the bundle comes from HEAD.' }
    $modelPath = Join-Path (Split-Path $repoRoot -Parent) 'dentisys-biometric-assets\face_landmarker.task'
    if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { throw 'Missing ..\dentisys-biometric-assets\face_landmarker.task.' }
    $key = Get-Item -LiteralPath $KeyFile
    if ($key.PSProvider.Name -ne 'FileSystem' -or $key.PSIsContainer) { throw 'KeyFile must be a local private-key file.' }
    $identity = $key.FullName
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $allowedSids = @($currentIdentity.User.Value, 'S-1-5-18', 'S-1-5-32-544')
    $acl = Get-Acl -LiteralPath $identity
    $unsafePrincipals = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object {
        $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData) -ne 0 -and
        $_.IdentityReference.Value -notin $allowedSids
    } | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
    if ($unsafePrincipals.Count -gt 0) {
        $sshDirectory = Join-Path $HOME '.ssh'
        $fixedKey = Join-Path $sshDirectory ($key.BaseName + '-restricted' + $key.Extension)
        $quotedSource = "'" + $identity.Replace("'", "''") + "'"
        $quotedDirectory = "'" + $sshDirectory.Replace("'", "''") + "'"
        $quotedTarget = "'" + $fixedKey.Replace("'", "''") + "'"
        $quotedGrant = "'" + ($currentIdentity.Name + ':(R)').Replace("'", "''") + "'"
        Write-Host 'The key grants read access to other principals. Run these commands, then use the restricted copy:'
        Write-Host "New-Item -ItemType Directory -Force -Path $quotedDirectory | Out-Null"
        Write-Host "Copy-Item -LiteralPath $quotedSource -Destination $quotedTarget"
        Write-Host "icacls $quotedTarget /reset"
        Write-Host "icacls $quotedTarget /inheritance:r"
        Write-Host "icacls $quotedTarget /grant:r $quotedGrant"
        foreach ($sid in $unsafePrincipals) { Write-Host "icacls $quotedTarget /remove '*$sid'" }
        throw 'Key ACL check failed. No ACLs were changed.'
    }
    foreach ($command in 'git', 'ssh', 'scp') { Get-Command $command -ErrorAction Stop | Out-Null }
    $keyArgs = @('-i', $identity, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10')
    $newInstanceCommand = ".\scripts\provision-vps.ps1 -Ip $Ip -KeyFile '" + $identity.Replace("'", "''") + "'"
    if ($Domain) { $newInstanceCommand += " -Domain '$Domain'" }
    if ($SshPort -ne 2202) { $newInstanceCommand += " -SshPort $SshPort" }
    if ($NoDbTunnel) { $newInstanceCommand += ' -NoDbTunnel' }
    $newInstanceCommand += ' -NewInstance'
    if ($NewInstance) { Reset-InstanceHostKeys }
    # Probes never prompt. Changed host keys stop with a rebuild command.
    $probeCommand = 'id -un; if [ -f /opt/dentisys/.env ]; then echo ENV_EXISTS; grep -E ''^(APP_DOMAIN|GHCR_USERNAME)='' /opt/dentisys/.env; fi'
    $probeResult = Invoke-SshProbe 'ubuntu' 22
    $fresh = $probeResult.ExitCode -eq 0
    $loginUser = 'ubuntu'
    $loginPort = 22
    if (-not $fresh) {
        $probeResult = Invoke-SshProbe 'devops' $SshPort
        if ($probeResult.ExitCode -ne 0) { throw 'No SSH probe succeeded. Resolve the connection diagnostics above, then rerun.' }
        $loginUser = 'devops'
        $loginPort = $SshPort
    }
    $probe = @($probeResult.Output -split '\r?\n' | Where-Object { $_ -ne '' })
    $envExists = $probe -contains 'ENV_EXISTS'
    if ($fresh) { Write-Host 'Mode: fresh server (ubuntu on 22).' }
    else { Write-Host "Mode: already hardened server (devops on $SshPort)." }
    if (-not $fresh -and -not $envExists) { Write-Host 'Resuming setup: server .env is missing; collect the fresh environment answers now.' }

    function Read-Answer {
        param([string]$Label, [string]$Default = '', [switch]$Optional)
        do {
            $prompt = $Label
            if ($Default) { $prompt += " [$Default]" }
            $answer = Read-Host $prompt
            if ($answer -eq '') { $answer = $Default }
            if ($answer -match "[`r`n`0]") { throw 'Answers must be one-line values.' }
        } while (-not $Optional -and [string]::IsNullOrWhiteSpace($answer))
        return $answer
    }
    function Read-Secret {
        param([string]$Label)
        do { $answer = Read-Host $Label -AsSecureString } while ($answer.Length -eq 0)
        Secret-Text $answer | Out-Null
        return $answer
    }
    function Secret-Text {
        param([Security.SecureString]$Secret)
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
        try {
            $text = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            if ($text -match "[`r`n`0]") { throw 'Secrets must be nonempty one-line values.' }
            return $text
        }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
    # Select local defaults by key before reading their values. Never send local
    # JWT, database passwords, biometric encryption keys or sidecar shared secrets.
    $calibrationKeys = @(
        'BIOMETRIC_HAAR_SCALE_FACTOR', 'BIOMETRIC_HAAR_MIN_NEIGHBORS', 'BIOMETRIC_HAAR_MIN_FACE_PX',
        'BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE', 'BIOMETRIC_LBPH_RADIUS', 'BIOMETRIC_LBPH_NEIGHBORS',
        'BIOMETRIC_LBPH_GRID_X', 'BIOMETRIC_LBPH_GRID_Y', 'BIOMETRIC_LBPH_THRESHOLD',
        'BIOMETRIC_MATCH_COUNT', 'BIOMETRIC_BLINK_THRESHOLD', 'BIOMETRIC_HEAD_TURN_RATIO',
        'BIOMETRIC_CHALLENGE_TTL_SECONDS'
    )
    $defaults = @{}
    if (-not $envExists) {
        $localEnv = Join-Path $repoRoot '.env'
        if (-not (Test-Path -LiteralPath $localEnv -PathType Leaf)) { throw 'Local .env is required for team-tested biometric calibration.' }
        foreach ($line in [IO.File]::ReadLines($localEnv)) {
            if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=') {
                $name = $Matches[1]
                if ($name -notin ($calibrationKeys + @('ALLOWED_EMAIL_DOMAINS', 'ALLOWED_EMAIL_DOMAIN', 'GOOGLE_CLIENT_ID'))) { continue }
                $value = $line.Substring($line.IndexOf('=') + 1).Trim()
                if ($value -match "^'(.*)'$" -or $value -match '^"(.*)"$') { $value = $Matches[1] }
                $defaults[$name] = $value
            }
        }
        foreach ($name in $calibrationKeys | Where-Object { $_ -ne 'BIOMETRIC_CHALLENGE_TTL_SECONDS' }) {
            if (-not $defaults[$name] -or $defaults[$name] -match 'replace_with_|\$') { throw "Set the team-tested $name in the local .env before provisioning." }
        }
    }
    $answers = [ordered]@{
        MODE = $(if ($envExists) { 'rerun' } else { 'fresh' })
        IP = $Ip
        DOMAIN = $Domain
        SSH_PORT = "$SshPort"
        NO_DB_TUNNEL = "$($NoDbTunnel.IsPresent)".ToLowerInvariant()
        SG_CONFIRMED = 'true'
    }
    $password = Read-Secret 'Devops sudo password'
    $passwordAgain = $null
    if ($fresh) {
        $passwordAgain = Read-Secret 'Repeat devops sudo password'
        if ((Secret-Text $password) -cne (Secret-Text $passwordAgain)) { throw 'Passwords do not match; nothing was uploaded or changed.' }
        $passwordAgain.Dispose()
        $passwordAgain = $null
    }
    if (-not $envExists) {
        $answers.GHCR_USERNAME = Read-Answer 'GHCR username' 'Light505'
        if ($answers.GHCR_USERNAME -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*$') { throw 'GHCR username must be a GitHub username.' }
    }
    $answers.GHCR_TOKEN = Read-Secret 'GHCR token (read:packages)'
    if (-not $envExists) {
        $answers.SMTP_USER = Read-Answer 'Gmail address (SMTP sender and certificate contact)'
        if ($answers.SMTP_USER -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Enter a valid Gmail address.' }
        $answers.SMTP_PASS = Read-Secret 'Gmail App Password'
        $answers.TRAEFIK_ACME_EMAIL = $answers.SMTP_USER
        $answers.FIRST_DEAN_FIRST_NAME = Read-Answer 'First Dean first name'
        $answers.FIRST_DEAN_LAST_NAME = Read-Answer 'First Dean last name'
        $answers.FIRST_DEAN_EMAIL = Read-Answer 'First Dean email'
        $answers.PGADMIN_DEFAULT_EMAIL = Read-Answer 'pgAdmin email' $answers.SMTP_USER
        if ($answers.PGADMIN_DEFAULT_EMAIL -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Enter a valid pgAdmin email.' }
        $answers.PGADMIN_DEFAULT_PASSWORD = Read-Secret 'pgAdmin password'
        $allowedDefault = $defaults['ALLOWED_EMAIL_DOMAINS']
        if (-not $allowedDefault) { $allowedDefault = $defaults['ALLOWED_EMAIL_DOMAIN'] }
        $answers.ALLOWED_EMAIL_DOMAINS = Read-Answer 'ALLOWED_EMAIL_DOMAINS (comma-separated)' $allowedDefault
        $allowed = @($answers.ALLOWED_EMAIL_DOMAINS.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() })
        if ($answers.FIRST_DEAN_EMAIL -notmatch '^[^@\s]+@([^@\s]+)$' -or $Matches[1].ToLowerInvariant() -notin $allowed) { throw 'First Dean email must use an allowed domain.' }
        $answers.GOOGLE_CLIENT_ID = Read-Answer 'GOOGLE_CLIENT_ID' $defaults['GOOGLE_CLIENT_ID'] -Optional
        foreach ($name in 'STUDENT_AUTH_ENABLED', 'BIOMETRIC_SIDECAR_ENABLED') {
            $answers[$name] = (Read-Answer $name 'true').ToLowerInvariant()
            if ($answers[$name] -notin @('true', 'false')) { throw "$name must be true or false." }
        }
        foreach ($name in $calibrationKeys) {
            if ($defaults[$name]) { $answers[$name] = $defaults[$name] }
        }
        $siteDomain = $Domain
        if (-not $siteDomain) { $siteDomain = $Ip.Replace('.', '-') + '.sslip.io' }
    }
    else {
        $domainLine = @($probe | Where-Object { $_ -like 'APP_DOMAIN=*' }) | Select-Object -Last 1
        $siteDomain = ($domainLine -replace '^APP_DOMAIN=', '').Trim().Trim("'", '"')
        if ($siteDomain -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$') { throw 'Existing APP_DOMAIN must be a hostname.' }
    }

    Write-Host "`n=== Confirm provisioning ==="
    Write-Host "Server: $Ip; SSH: $loginUser on $loginPort -> devops on $SshPort; site: https://$siteDomain"
    Write-Host "Loopback database/Mailpit tunnels: $(-not $NoDbTunnel); existing server .env retained: $envExists"
    Write-Host 'Devops password: ********; GHCR token: ********'
    foreach ($entry in $answers.GetEnumerator()) {
        if ($entry.Value -is [Security.SecureString]) { if ($entry.Key -ne 'GHCR_TOKEN') { Write-Host "$($entry.Key): ********" }; continue }
        if ($entry.Key -notin @('MODE', 'IP', 'DOMAIN', 'SSH_PORT', 'NO_DB_TUNNEL', 'SG_CONFIRMED')) { Write-Host "$($entry.Key): $($entry.Value)" }
    }
    Write-Host "AWS checklist: TCP $SshPort from your IP and 80/443 open; hostname resolves to the Elastic IP; images :demo already published."
    Write-Host 'Have Session Manager or configured Instance Connect recovery ready. This command changes only the VPS.'
    $confirmation = Read-Host 'Press Enter to confirm the AWS checklist and start (anything else cancels)'
    if ($confirmation -ne '') { throw 'Cancelled before upload or server changes.' }

    # The only local staging is the clean-HEAD, non-secret bundle and model.
    & (Join-Path $PSScriptRoot 'upload-vps.ps1') -Server "$loginUser@$Ip" -Port $loginPort -IdentityFile $identity -ModelPath $modelPath -Provision
    $remote = 'sudo -n bash /tmp/dentisys-deploy/scripts/provision-vps.sh'
    if ($loginUser -eq 'devops') {
        # Force fresh sudo authentication and put its newline password before
        # the NUL protocol. Do not rely on a cached timestamp across pipes.
        $remote = 'bash -c ''set +x; IFS= read -r -d "" password || exit 1; if sudo -n -k true >/dev/null 2>&1; then { printf "%s\0" "$password"; unset password; cat; } | sudo -n bash /tmp/dentisys-deploy/scripts/provision-vps.sh; else { printf "%s\n%s\0" "$password" "$password"; unset password; cat; } | sudo -k -S -p "" bash /tmp/dentisys-deploy/scripts/provision-vps.sh; fi'''
    }
    # Merge remote streams at their source for ordering; also capture SSH's own stderr.
    $remote = 'set +x; exec 2>&1; ' + $remote
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = @(Get-Command ssh -CommandType Application)[0].Source
    $sessionArgs = $keyArgs + @('-T', '-p', "$loginPort", "$loginUser@$Ip", $remote)
    $start.Arguments = ($sessionArgs | ForEach-Object { Quote-NativeArgument $_ }) -join ' '
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8
    $start.StandardErrorEncoding = [Text.Encoding]::UTF8
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'Unable to start SSH.' }
    $readers = @($process.StandardOutput, $process.StandardError)
    $readTasks = @($readers[0].ReadLineAsync(), $readers[1].ReadLineAsync())
    $lastLines = New-Object 'Collections.Generic.Queue[string]'
    function Receive-SessionOutput {
        for ($i = 0; $i -lt $readers.Count; $i++) {
            while ($null -ne $readTasks[$i] -and $readTasks[$i].IsCompleted) {
                $line = $readTasks[$i].GetAwaiter().GetResult()
                if ($null -eq $line) { $readTasks[$i] = $null; break }
                Write-Host $line
                $lastLines.Enqueue($line)
                while ($lastLines.Count -gt 20) { $null = $lastLines.Dequeue() }
                $readTasks[$i] = $readers[$i].ReadLineAsync()
            }
        }
    }
    function Write-Field {
        param($Value)
        $plain = $null
        $bytes = $null
        try {
            if ($Value -is [Security.SecureString]) { $plain = Secret-Text $Value } else { $plain = [string]$Value }
            $bytes = [Text.Encoding]::UTF8.GetBytes($plain + [char]0)
            $write = $process.StandardInput.BaseStream.WriteAsync($bytes, 0, $bytes.Length)
            while (-not $write.IsCompleted) {
                Receive-SessionOutput
                [Threading.Thread]::Sleep(20)
            }
            $null = $write.GetAwaiter().GetResult()
            Receive-SessionOutput
        }
        finally {
            if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
            $plain = $null
        }
    }
    try {
        $inputFailed = $false
        try {
            Write-Field $password
            Write-Field 'DENTISYS_PROVISION_1'
            foreach ($entry in $answers.GetEnumerator()) { Write-Field $entry.Key; Write-Field $entry.Value }
            Write-Field 'END'
        }
        catch { $inputFailed = $true }
        finally {
            try { $process.StandardInput.Close() } catch { $inputFailed = $true }
        }
        while ($null -ne $readTasks[0] -or $null -ne $readTasks[1]) {
            Receive-SessionOutput
            [Threading.Thread]::Sleep(20)
        }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0 -or $inputFailed) {
            $quotedKey = "'" + $identity.Replace("'", "''") + "'"
            Write-Host 'Server log: /var/log/dentisys-provision.log (root only).'
            Write-Host "Read it: ssh -i $quotedKey -o IdentitiesOnly=yes -t -p $SshPort devops@$Ip 'sudo tail -n 80 /var/log/dentisys-provision.log'"
            if ($fresh) {
                Write-Host "If SSH has not switched yet: ssh -i $quotedKey -o IdentitiesOnly=yes -t -p 22 ubuntu@$Ip 'sudo tail -n 80 /var/log/dentisys-provision.log'"
            }
            $reason = "Server provisioning failed (exit $($process.ExitCode))."
            if ($inputFailed) { $reason += ' SSH stdin transmission did not complete.' }
            $tail = ($lastLines.ToArray() -join [Environment]::NewLine)
            if (-not $tail) { $tail = '(No server output received; check the SSH connection.)' }
            throw "$reason Fix the reported failure and rerun.`nLast server/SSH output (up to 20 lines):`n$tail"
        }
    }
    finally {
        $process.StandardInput.Dispose()
        $process.Dispose()
    }
    # This request comes from the Owner's PC, independently of server-side curls.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
        $health = Invoke-RestMethod -Uri "https://$siteDomain/api/health" -TimeoutSec 20
        if ($health.status -ne 'ok') { throw 'Unhealthy API.' }
    }
    catch { throw 'FAIL: public HTTPS/API health from the PC; check DNS, certificate and Security Group access.' }
    Write-Host 'PASS: public HTTPS and API health from the PC.'
    if ($fresh) { Write-Host 'Manual: remove TCP 22 from the AWS Security Group after checking the new login.' }
    $quotedKey = "'" + $identity.Replace("'", "''") + "'"
    Write-Host "Login: ssh -i $quotedKey -o IdentitiesOnly=yes -p $SshPort devops@$Ip"
    Write-Host "Site: https://$siteDomain"
}
finally {
    if ($password) { $password.Dispose() }
    if ($passwordAgain) { $passwordAgain.Dispose() }
    if ($answers) { foreach ($entry in $answers.GetEnumerator()) { if ($entry.Value -is [Security.SecureString]) { $entry.Value.Dispose() } }; $answers.Clear() }
    Pop-Location
}
