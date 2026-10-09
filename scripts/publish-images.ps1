[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*$')]
    [string]$Namespace = 'light505',
    [ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$')]
    [string]$Tag = 'demo'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Namespace = $Namespace.ToLowerInvariant()
if ($Tag -like 'sha-*') { throw 'Use a moving tag such as demo; sha-* tags identify commits.' }

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
    if ($dirty.Count -gt 0) { throw 'Refusing to publish a dirty working tree. Test and commit the changes first.' }
    $sha = (& git rev-parse --short=12 HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]+$') { throw 'Unable to read the tested commit SHA.' }
    Write-Host "Publishing commit $sha for linux/amd64. Run docker login ghcr.io first."

    # Build the committed tree only. Extra ignore rules live in this disposable
    # archive, so existing development contexts and Dockerfiles stay unchanged.
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $stagingRoot = Join-Path $tempBase ("dentisys-publish-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingRoot | Out-Null
    $archive = Join-Path $stagingRoot 'commit.tar'
    $snapshot = Join-Path $stagingRoot 'source'
    New-Item -ItemType Directory -Path $snapshot | Out-Null
    Invoke-Native git @('archive', '--format=tar', '-o', $archive, 'HEAD')
    # Relative paths also work when Git's GNU tar is first on Windows PATH.
    Push-Location $stagingRoot
    try { Invoke-Native tar @('-xf', 'commit.tar', '-C', 'source') }
    finally { Pop-Location }
    $privatePatterns = @(
        '**/.env*', '**/*.key', '**/*.pem', '**/*.p12', '**/*.pfx',
        '**/keys', '**/secrets', '**/backups', '**/*.dump', '**/*.backup', '**/*.sql', '**/*.sql.gz',
        '**/*.task', '**/face_landmarker*', '**/.docker', '**/id_rsa*', '**/id_ed25519*'
    ) -join "`n"
    $images = @(
        @{ Name = 'web'; Context = $snapshot; Target = 'runtime' },
        @{ Name = 'frontend'; Context = (Join-Path $snapshot 'frontend'); Target = 'production' },
        @{ Name = 'biometric'; Context = (Join-Path $snapshot 'biometric-sidecar'); Target = '' }
    )
    foreach ($image in $images) {
        $ignorePath = Join-Path $image.Context '.dockerignore'
        if (-not (Test-Path -LiteralPath $ignorePath)) { throw "Missing ignore file: $ignorePath" }
        $ignore = [IO.File]::ReadAllText($ignorePath) + "`n" + $privatePatterns + "`n"
        [IO.File]::WriteAllText((Join-Path $image.Context 'Dockerfile.dockerignore'), $ignore, [Text.UTF8Encoding]::new($false))
        $image.Repository = "ghcr.io/$Namespace/dentisys-$($image.Name)"
        $buildArgs = @('build', '--pull', '--platform', 'linux/amd64', '-f', (Join-Path $image.Context 'Dockerfile'), '-t', "$($image.Repository):sha-$sha", '-t', "$($image.Repository):$Tag")
        if ($image.Target) { $buildArgs += @('--target', $image.Target) }
        $buildArgs += $image.Context
        Invoke-Native docker $buildArgs
    }
    foreach ($image in $images) {
        foreach ($imageTag in @("sha-$sha", $Tag)) {
            & docker push "$($image.Repository):$imageTag"
            if ($LASTEXITCODE -ne 0) {
                throw 'Push failed. Run docker login ghcr.io with package write access, then rerun this script. It does not handle tokens.'
            }
        }
    }
    Write-Host "Published web, frontend and biometric as sha-$sha and $Tag."
}
finally {
    if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
        $resolvedStage = [IO.Path]::GetFullPath($stagingRoot)
        $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolvedStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStage -Leaf) -notmatch '^dentisys-publish-[0-9a-f]{32}$') {
            throw 'Refusing to remove an unexpected staging path.'
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
    Pop-Location
}
