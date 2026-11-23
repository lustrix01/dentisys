# Lists the backlog items a release carries, from git, not from memory or a handoff.
# Item ids come from feat/fix/perf commit subjects in <Since>..<Until> (e.g. "(14.3)" or
# "user reports 14.1, 14.2"); merge commits are skipped, the commits they bring in are not.
# For each id it shows the docs/PRODUCT_BACKLOG.md section that holds it and whether
# docs/features.md has a "backlog <id>" line, both read at <Until>. Release step 2 and the
# handoff skill use it (docs/release-guide.md).
#
#   -Since      last production sha; default: the last "Promoted to production ... (sha X)"
#               in the backlog's Done section
#   -Until      default HEAD
#   -Changelog  also print a changelog skeleton (item, backlog text, commits)
#   -LookOnly   ids that change only how a screen looks and need no features.md line
#               (e.g. -LookOnly 14.1,14.7); say so in the change doc
#
# Exit code 1 when an id is in neither "On the demo, awaiting promotion" nor "Done", or has
# no features.md line and is not in -LookOnly.
param(
    [string] $Since,
    [string] $Until = "HEAD",
    [switch] $Changelog,
    [string[]] $LookOnly = @()
)

$ErrorActionPreference = "Stop"
$LookOnly = @($LookOnly | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
Set-Location (Split-Path -Parent $PSScriptRoot)

function Show-File([string] $Path) {
    $text = git show "${Until}:$Path"
    if ($LASTEXITCODE -ne 0) { throw "git show ${Until}:$Path failed" }
    return @($text)
}

$backlog = Show-File "docs/PRODUCT_BACKLOG.md"
$features = (Show-File "docs/features.md") -join "`n"

if (-not $Since) {
    $promoted = [regex]::Matches(($backlog -join "`n"), 'Promoted to production on [^(]*\(sha ([0-9a-f]{7,40})\)')
    if ($promoted.Count -eq 0) { throw "No 'Promoted to production ... (sha X)' in the backlog; pass -Since." }
    $Since = $promoted[$promoted.Count - 1].Groups[1].Value
}
$range = "$Since..$Until"

$log = git log --no-merges --reverse --format="%h%x09%s" $range
if ($LASTEXITCODE -ne 0) { throw "git log $range failed" }

$items = [ordered]@{}
foreach ($line in @($log)) {
    if (-not $line) { continue }
    $sha, $subject = $line -split "`t", 2
    if ($subject -notmatch '^(feat|fix|perf)(\([^)]*\))?!?:') { continue }
    foreach ($m in [regex]::Matches($subject, '(?<![\d.])(\d{1,2}\.\d{1,2})(?!\.?\d)')) {
        $id = $m.Groups[1].Value
        if (-not $items.Contains($id)) { $items[$id] = [System.Collections.Generic.List[string]]::new() }
        $items[$id].Add("$sha $subject")
    }
}

# Section of the backlog ("# ..." heading) that holds each "- **<id>**" line.
$section = ""
$where = @{}
$text = @{}
foreach ($l in $backlog) {
    if ($l -match '^# (.+)$') { $section = $Matches[1].Trim(); continue }
    if ($l -match '^- \*\*(\d{1,2}\.\d{1,2})\*\*\s*(.*)$') {
        $where[$Matches[1]] = $section
        if (-not $text.ContainsKey($Matches[1])) { $text[$Matches[1]] = $Matches[2] }
    }
}

Write-Host "Range $range ($($items.Count) items)"
$problems = 0
foreach ($id in $items.Keys) {
    $sec = if ($where.ContainsKey($id)) { $where[$id] } else { "(not in backlog)" }
    $inFeatures = $features -match "backlog $([regex]::Escape($id))(?!\.?\d)"
    $flags = @()
    if ($sec -notmatch '^(On the demo|Done)') { $flags += "not moved" }
    if (-not $inFeatures -and $LookOnly -notcontains $id) { $flags += "no features.md line" }
    if ($flags.Count) { $problems++ }
    $mark = if ($flags.Count) { "CHECK" } else { "ok" }
    Write-Host ("{0,-6} {1,-6} {2} | features.md: {3}{4}" -f $mark, $id, $sec, $(if ($inFeatures) { "yes" } else { "no" }), $(if ($flags.Count) { "  <- " + ($flags -join ", ") } else { "" }))
}

if ($Changelog) {
    Write-Host ""
    Write-Host "## Changelog skeleton ($range)"
    foreach ($id in $items.Keys) {
        Write-Host ""
        Write-Host "### $id"
        if ($text.ContainsKey($id)) { Write-Host $text[$id] }
        foreach ($c in $items[$id]) { Write-Host "- $c" }
    }
}

if ($problems) {
    Write-Host ""
    Write-Host "$problems item(s) to check: move them in the backlog, add a features.md line, or say in the change doc why none is needed."
    exit 1
}
