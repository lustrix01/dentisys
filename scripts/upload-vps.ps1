[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*$')]
    [string]$Server,
    [ValidateRange(1, 65535)]
    [int]$Port = 22,
    [string]$IdentityFile,
    [string]$ModelPath = '..\dentisys-biometric-assets\face_landmarker.task',
    [string]$YuNetModelPath = '..\dentisys-biometric-assets\face_detection_yunet_2023mar.onnx',
    [string]$SFaceModelPath = '..\dentisys-biometric-assets\face_recognition_sface_2021dec.onnx',
    [switch]$SkipModel,
    [switch]$Deploy,
    [switch]$Provision
)

$ErrorActionPreference = 'Stop'
if ($Provision -and ($Deploy -or $SkipModel)) { throw 'Provision requires the model and cannot be combined with Deploy.' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sshArgs = @('-p', "$Port")
$scpArgs = @('-P', "$Port")
if ($IdentityFile) {
    $identity = (Resolve-Path -LiteralPath $IdentityFile).Path
    if (-not (Test-Path -LiteralPath $identity -PathType Leaf)) { throw 'IdentityFile must be a key file.' }
    $sshArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
    $scpArgs += @('-i', $identity, '-o', 'IdentitiesOnly=yes')
}

if ($Provision) {
    $sshArgs += @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
    $scpArgs += @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)
    # Windows PowerShell treats redirected native stderr as an error record.
    $nativeCommand = Get-Command -Name $Command -ErrorAction Stop
    $nativePreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $nativeCommand @Arguments
        $nativeExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $nativePreference }
    if ($nativeExit -ne 0) { throw "$Command failed (exit $nativeExit)." }
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
    if ($Provision) { $bundleFiles += @('scripts/provision-vps.sh', 'scripts/harden-vps.sh') }
    Invoke-Native git (@('archive', '--format=tar.gz', '-o', $archive, 'HEAD') + $bundleFiles)
    $uploadFiles = @($archive)
    $uploadModels = @()
    if (-not $SkipModel) {
        $models = @(
            @{ Path = $ModelPath; Name = 'face_landmarker.task'; HashKey = 'MEDIAPIPE_FACE_LANDMARKER_SHA256' },
            @{ Path = $YuNetModelPath; Name = 'face_detection_yunet_2023mar.onnx'; HashKey = 'BIOMETRIC_YUNET_SHA256' },
            @{ Path = $SFaceModelPath; Name = 'face_recognition_sface_2021dec.onnx'; HashKey = 'BIOMETRIC_SFACE_SHA256' }
        )
        foreach ($modelInfo in $models) {
            $model = (Resolve-Path -LiteralPath $modelInfo.Path).Path
            if (-not (Test-Path -LiteralPath $model -PathType Leaf)) { throw "Model path must be a file: $($modelInfo.Path)" }
            $stagedModel = Join-Path $stagingRoot $modelInfo.Name
            Copy-Item -LiteralPath $model -Destination $stagedModel
            $modelHash = (Get-FileHash -LiteralPath $stagedModel -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-Host "$($modelInfo.HashKey)=$modelHash"
            $remotePath = "/opt/dentisys/assets/$($modelInfo.Name)"
            $remoteHash = (Invoke-Native ssh ($sshArgs + @($Server, "if [ -f '$remotePath' ]; then sha256sum '$remotePath'; fi")) | Out-String).Trim()
            if (($remoteHash -split '\s+')[0] -eq $modelHash) {
                Write-Host "$($modelInfo.Name) already matches; skipping upload."
            }
            else {
                $uploadFiles += $stagedModel
                $uploadModels += @{ Path = $stagedModel; Name = $modelInfo.Name; Hash = $modelHash }
            }
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
    foreach ($modelInfo in $uploadModels) {
        $remoteName = $modelInfo.Name
        $remoteHashPath = "/tmp/$remoteName"
        $installCommand = if ($Provision) {
            "install -m 0644 '$remoteHashPath' '/tmp/dentisys-deploy/$remoteName'"
        }
        else {
            "if [ -d /opt/dentisys/assets ]; then install -m 0644 '$remoteHashPath' '/opt/dentisys/assets/$remoteName'; else echo 'deploy-vps.sh first creates /opt/dentisys; model left at $remoteHashPath. Rerun upload-vps.ps1 after its first run to install the model.'; fi"
        }
        $remoteCommands += @(
            "echo '$($modelInfo.Hash)  $remoteHashPath' | sha256sum -c -",
            $installCommand
        )
    }
    if ($Deploy) { $remoteCommands += 'bash /tmp/dentisys-deploy/scripts/deploy-vps.sh' }
    $sessionArgs = $sshArgs
    if ($Deploy) { $sessionArgs += '-t' }
    Invoke-Native ssh ($sessionArgs + @($Server, ($remoteCommands -join '; ')))
    if (-not $Deploy -and -not $Provision) {
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
