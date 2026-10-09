[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z_][a-z0-9_-]{0,31}@[A-Za-z0-9][A-Za-z0-9.-]*\z')]
    [string]$Server,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$KeyFile,
    [ValidateRange(1, 65535)]
    [int]$Port = 22,
    [switch]$NoDbTunnel
)

$ErrorActionPreference = 'Stop'
$loginUser, $serverName = $Server.Split('@')
if ($loginUser -eq 'root') { throw 'Connect as ubuntu initially, or as devops on port 2202 when rerunning.' }
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
    # Print a repair for a separate copy. Never change ACLs or move the original.
    $sshDirectory = Join-Path $HOME '.ssh'
    $fixedKey = Join-Path $sshDirectory ($key.BaseName + '-restricted' + $key.Extension)
    $quotedSource = "'" + $identity.Replace("'", "''") + "'"
    $quotedDirectory = "'" + $sshDirectory.Replace("'", "''") + "'"
    $quotedTarget = "'" + $fixedKey.Replace("'", "''") + "'"
    $quotedGrant = "'" + ($currentIdentity.Name + ':(R)').Replace("'", "''") + "'"
    Write-Host 'The private key grants read access to other principals. Run these commands in PowerShell, then use the restricted copy as KeyFile:'
    Write-Host "New-Item -ItemType Directory -Force -Path $quotedDirectory | Out-Null"
    Write-Host "Copy-Item -LiteralPath $quotedSource -Destination $quotedTarget"
    # Reset removes explicit entries; inheritance:r then removes inherited entries.
    Write-Host "icacls $quotedTarget /reset"
    Write-Host "icacls $quotedTarget /inheritance:r"
    Write-Host "icacls $quotedTarget /grant:r $quotedGrant"
    foreach ($sid in $unsafePrincipals) {
        Write-Host "icacls $quotedTarget /remove '*$sid'"
    }
    throw 'Key ACL check failed. No files were uploaded and no ACLs were changed.'
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)." }
}

$serverScript = Join-Path $PSScriptRoot 'harden-vps.sh'
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) { throw "Server script not found: $serverScript" }
$remoteScript = '/tmp/dentisys-hardening-' + [Guid]::NewGuid().ToString('N') + '.sh'
$keyArgs = @('-i', $identity, '-o', 'IdentitiesOnly=yes')
$scpArgs = @('-P', "$Port") + $keyArgs + @($serverScript, "${Server}:$remoteScript")
Invoke-Native scp $scpArgs
$flags = ''
if ($NoDbTunnel) { $flags = ' --no-db-tunnel' }
# The remote shell removes this invocation's upload even if hardening fails.
$remoteCommand = "trap 'rm -f -- $remoteScript' EXIT; sudo bash $remoteScript$flags"
$sshArgs = @('-t', '-p', "$Port") + $keyArgs + @($Server, $remoteCommand)
Invoke-Native ssh $sshArgs
$quotedKey = "'" + $identity.Replace("'", "''") + "'"
Write-Host 'Keep the original SSH session open until the second login succeeds.'
Write-Host "In a SECOND window: ssh -i $quotedKey -p 2202 devops@${serverName}"
Write-Host 'Add -o IdentitiesOnly=yes if your SSH agent offers other keys.'
Write-Host 'After the login succeeds, remove TCP 22 from the AWS Security Group.'
Write-Host 'Then follow docs/vps-deployment.md: publish tested images, create/upload the bundle and model as devops on 2202, then run bash scripts/deploy-vps.sh on the server.'
Write-Host 'Recovery: AWS EC2 -> instance -> Connect -> Session Manager (configured SSM Agent/IAM), or EC2 Instance Connect configured for devops on 2202. The default port-22 browser connection cannot reach this listener.'
