# Test-pass stamps for the publish gate. Dot-source it: . (Join-Path $PSScriptRoot 'test-stamp.ps1')
# A stamp records git's tree hash of the exact files a gate tested (committed or not, untracked included,
# .gitignore respected). Committing those same files gives a commit with the same tree hash, so
# publish-images.ps1 can tell whether HEAD's content passed. Stamps live in the shared .git folder, so they are
# never committed and are visible from `git worktree` copies.

function Get-WorkTreeId {
    # Hash the working tree through a throwaway copy of the index; the real index and HEAD are untouched.
    $index = (& git rev-parse --path-format=absolute --git-path index).Trim()
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("dentisys-index-" + [Guid]::NewGuid().ToString('N'))
    try {
        if (Test-Path -LiteralPath $index) { Copy-Item -LiteralPath $index -Destination $temp }
        $env:GIT_INDEX_FILE = $temp
        & git add -A 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Unable to hash the working tree (git add).' }
        $tree = (& git write-tree).Trim()
        if ($LASTEXITCODE -ne 0 -or $tree -notmatch '^[0-9a-f]{40,64}$') { throw 'Unable to hash the working tree (git write-tree).' }
        return $tree
    } finally {
        Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

function Get-StampDir {
    $common = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
    $dir = Join-Path $common 'dentisys-pass'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return $dir
}

# kind: 'check' (scripts/check.ps1) or 'pg' (scripts/check-postgres.ps1). Stamps only when the files did not
# change while the gate ran.
function Write-TestStamp([string]$Kind, [string]$TreeAtStart) {
    $tree = Get-WorkTreeId
    if ($tree -ne $TreeAtStart) {
        Write-Warning "Files changed while the $Kind gate ran, so this pass was NOT recorded. Rerun it on unchanged files."
        return
    }
    $head = (& git rev-parse HEAD).Trim()
    Set-Content -LiteralPath (Join-Path (Get-StampDir) "$tree.$Kind") -Value "$(Get-Date -Format o) head=$head" -Encoding utf8NoBOM
    $extra = @(& git status --porcelain --untracked-files=all)
    $note = if ($extra.Count -eq 0) { "HEAD $($head.Substring(0, 12)) may be published." } else { "$($extra.Count) uncommitted file(s) were part of this run, so it only counts for a commit with exactly these files. Usual path: commit first, then run the gate with nothing else uncommitted." }
    Write-Host "Recorded $Kind pass for content $($tree.Substring(0, 12)). $note"
}

# Server-side paths: a change here needs a check-postgres.ps1 pass, not only check.ps1.
$ServerPaths = @('backend', 'database', 'biometric-sidecar', 'docker', 'Dockerfile', 'docker-compose*.yml', 'e2e/live')

# Returns the reasons HEAD may not be published (empty when it may).
function Get-PublishBlockers {
    $tree = (& git rev-parse 'HEAD^{tree}').Trim()
    $dir = Get-StampDir
    $reasons = @()
    if (-not (Test-Path -LiteralPath (Join-Path $dir "$tree.check"))) {
        $reasons += 'scripts/check.ps1 has not passed on exactly this commit''s files.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $dir "$tree.pg"))) {
        # Any earlier pass counts when the server-side files are identical to it. Passes whose tree git has
        # since pruned (untested content is collected after about two weeks) are skipped.
        $closest = $null
        foreach ($stamp in Get-ChildItem -LiteralPath $dir -Filter '*.pg' | Sort-Object LastWriteTime -Descending) {
            & git cat-file -e "$($stamp.BaseName)^{tree}" 2>$null
            if ($LASTEXITCODE -ne 0) { continue }
            $changed = @(& git diff --name-only $stamp.BaseName $tree -- @ServerPaths 2>$null)
            if ($LASTEXITCODE -ne 0) { continue }
            if ($changed.Count -eq 0) { $closest = @(); break }
            if ($null -eq $closest) { $closest = $changed }
        }
        if ($null -eq $closest) {
            $reasons += 'scripts/check-postgres.ps1 has no recorded pass to compare against.'
        } elseif ($closest.Count -gt 0) {
            $reasons += "Server-side files changed since the last scripts/check-postgres.ps1 pass ($($closest[0])$(if ($closest.Count -gt 1) { " and $($closest.Count - 1) more" }))."
        }
    }
    return $reasons
}
