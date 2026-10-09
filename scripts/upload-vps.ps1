[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*$')]
    [string]$Server,
    [ValidateRange(1, 65535)]
    [int]$Port = 22,
    [string]$IdentityFile,
    [string]$ModelPath = '..\dentisys-biometric-assets\face_landmarker.task',
    [switch]$SkipModel,
    [switch]$Deploy
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sshArgs = @('-p', "$Port")
$scpArgs = @('-P', "$Port")
if ($IdentityFile) {
    $identity = (Resolve-Path -LiteralPath $IdentityFile).Path
    if (-not (Test-Path -LiteralPath $identity -PathType Leaf)) { throw 'IdentityFile must be a key file.' }
    $sshArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
    $scpArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)." }
}

Push-Location $repoRoot
$stagingRoot = $null
try {
    $dirty = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to check the working tree.' }
    if ($dirty.Count -gt 0) { throw 'Refusing to upload a dirty working tree. Test and commit the changes first.' }
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $stagingRoot = Join-Path $tempBase ('dentisys-upload-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingRoot | Out-Null
    $archive = Join-Path $stagingRoot 'dentisys-deploy.tar.gz'
    $bundleFiles = @(
        '.env.vps.example', 'docker-compose.web.yml', 'docker-compose.database.yml',
        'docker-compose.vps.yml', 'database/init.sql', 'database/apply-migrations.sh',
        'database/pgadmin-servers.json', 'database/migrations', 'scripts/deploy-vps.sh',
        'scripts/backup-vps.sh', 'scripts/migrate-vps.sh'
    )
    Invoke-Native git (@('archive', '--format=tar.gz', '-o', $archive, 'HEAD') + $bundleFiles)
    $uploadFiles = @($archive)
    $uploadModel = $false
    if (-not $SkipModel) {
        # Resolve relative model paths from the repository, and transfer a fixed filename.
        $model = (Resolve-Path -LiteralPath $ModelPath).Path
        if (-not (Test-Path -LiteralPath $model -PathType Leaf)) { throw 'ModelPath must be a model file.' }
        $stagedModel = Join-Path $stagingRoot 'face_landmarker.task'
        Copy-Item -LiteralPath $model -Destination $stagedModel
        $modelHash = (Get-FileHash -LiteralPath $stagedModel -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "MEDIAPIPE_FACE_LANDMARKER_SHA256=$modelHash"
        $remoteHash = (Invoke-Native ssh ($sshArgs + @($Server, 'if [ -f /opt/dentisys/assets/face_landmarker.task ]; then sha256sum /opt/dentisys/assets/face_landmarker.task; fi')) | Out-String).Trim()
        if (($remoteHash -split '\s+')[0] -eq $modelHash) {
            Write-Host 'Installed model matches; skipping model upload.'
        }
        else {
            $uploadFiles += $stagedModel
            $uploadModel = $true
        }
    }
    Invoke-Native scp ($scpArgs + $uploadFiles + @("${Server}:/tmp/"))

    # Only this fixed disposable remote directory may be removed. Commands use
    # fixed paths and single quotes so Windows PowerShell/OpenSSH preserve them.
    $remoteCommands = @(
        'set -eu',
        'stage=/tmp/dentisys-deploy',
        '[ $stage = /tmp/dentisys-deploy ] || exit 1',
        'rm -rf -- $stage',
        'mkdir -m 0700 -- $stage',
        'tar -xzf /tmp/dentisys-deploy.tar.gz -C $stage'
    )
    if ($uploadModel) {
        $remoteCommands += @(
            "echo '$modelHash  /tmp/face_landmarker.task' | sha256sum -c -",
            "if [ -d /opt/dentisys/assets ]; then install -m 0644 /tmp/face_landmarker.task /opt/dentisys/assets/face_landmarker.task; else echo 'deploy-vps.sh first creates /opt/dentisys; model left at /tmp/face_landmarker.task. Rerun upload-vps.ps1 after its first run to install the model.'; fi"
        )
    }
    if ($Deploy) { $remoteCommands += 'bash /tmp/dentisys-deploy/scripts/deploy-vps.sh' }
    $sessionArgs = $sshArgs
    if ($Deploy) { $sessionArgs += '-t' }
    Invoke-Native ssh ($sessionArgs + @($Server, ($remoteCommands -join '; ')))
    if (-not $Deploy) {
        $deployArgs = $sshArgs + @('-t', $Server, 'bash /tmp/dentisys-deploy/scripts/deploy-vps.sh')
        $quotedArgs = $deployArgs | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }
        Write-Host ('Deploy with: ssh ' + ($quotedArgs -join ' '))
    }
}
finally {
    if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
        $resolvedStage = [IO.Path]::GetFullPath($stagingRoot)
        $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStage -Leaf) -notmatch '^dentisys-upload-[0-9a-f]{32}$') {
            throw 'Refusing to remove an unexpected staging path.'
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
    Pop-Location
}
