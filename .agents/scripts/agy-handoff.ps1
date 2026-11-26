<#
.SYNOPSIS
  Claude's driver for a Neon high hand-off run (docs/archive/agy-swarm-handoff-plan-2026-11.md).

.DESCRIPTION
  -Phase readiness : plan mode, no edits; prints Neon's path choice and doubts (schema .agents/schemas/readiness.json).
  -Phase build     : full run in the worktree (stream-json log); same conversation when -Conversation is given.
  -Phase learn     : resumes -Conversation with -Brief as the prompt; ranked fixes (schema .agents/schemas/learn.json).
  Before readiness/build it creates the worktree when missing (on -Branch, or detached when -Branch is empty)
  and runs npm ci. It refuses a dirty worktree unless -Conversation resumes a run (a run stopped mid-way leaves
  its half-done edits there). Before starting it reads the Gemini quota (agy -p "/quota", no turn spent) and
  refuses when the 5-hour or weekly share left is below -MinQuota; -IgnoreQuota overrides that, and Claude
  passes it only on the Owner's instruction. It sets DENTISYS_AGY_GUARD=1, runs agy with the worktree as its
  working folder, and after the run prints: status, the AGY_ERROR reason when it stopped on an error (e.g.
  quota), time, tokens, quota left, worker models requested and seen, leftover swarm worktrees, and any
  change to protected paths.

.EXAMPLE
  pwsh -NoProfile -File .agents/scripts/agy-handoff.ps1 -Phase readiness -Brief docs/archive/brief-x.md -Worktree ..\dentisys-x -Base lighthal9-responsive
#>
param(
  [Parameter(Mandatory)][ValidateSet('readiness', 'build', 'learn')][string]$Phase,
  [Parameter(Mandatory)][string]$Brief,
  [Parameter(Mandatory)][string]$Worktree,
  [string]$Base = 'HEAD',
  [string]$Branch = '',
  [string]$Conversation = '',
  [string]$Model = 'gemini-4-neon-high',
  [double]$MinQuota = 0.2,
  [switch]$IgnoreQuota,
  [string]$LogDir = (Join-Path ([IO.Path]::GetTempPath()) 'agy-handoff')
)
$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
$briefText = Get-Content -Raw (Resolve-Path $Brief)
$wt = [IO.Path]::GetFullPath($Worktree, (Get-Location).Path)
New-Item -ItemType Directory -Force $LogDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $LogDir "$Phase-$stamp"

if ($Phase -ne 'learn') {
  if (-not (Test-Path $wt)) {
    if ($Branch) { git -C $repo worktree add -b $Branch $wt $Base } else { git -C $repo worktree add --detach $wt $Base }
    if ($LASTEXITCODE) { throw "git worktree add failed" }
    foreach ($dir in @($wt, (Join-Path $wt 'frontend'))) {
      Push-Location $dir; npm ci --prefer-offline --no-audit --no-fund *> "$log.npm.log"; $npm = $LASTEXITCODE; Pop-Location
      if ($npm) { throw "npm ci failed in $dir (see $log.npm.log)" }
    }
  }
  $dirty = git -C $wt status --porcelain
  if ($dirty -and -not $Conversation) { throw "worktree $wt is not clean; swarm 'share' workers would copy these files:`n$dirty" }
  if ($dirty) { Write-Warning "Resuming with uncommitted files in the worktree (left by the stopped run):`n$($dirty -join "`n")" }
}
if (-not (Test-Path $wt)) { throw "worktree $wt does not exist" }

function Get-GeminiQuota {
  try {
    $q = (agy -p '/quota' --output-format json 2>$null | ConvertFrom-Json).command.data.groups | Where-Object name -eq 'Gemini Models'
    return @($q.buckets | ForEach-Object { [pscustomobject]@{ window = $_.window; left = [double]$_.remaining_fraction; reset = $_.reset_time } })
  } catch { return @() }
}
$quotaBefore = Get-GeminiQuota
if (-not $quotaBefore) { Write-Warning 'Could not read the Gemini quota (agy -p "/quota").' }
$low = $quotaBefore | Where-Object left -lt $MinQuota
if ($low -and -not $IgnoreQuota) {
  throw ("Gemini quota below {0:P0}: {1}. Wait for the reset, or rerun with -IgnoreQuota on the Owner's instruction." -f $MinQuota,
    (($low | ForEach-Object { '{0} {1:P0} left, resets {2}' -f $_.window, $_.left, $_.reset }) -join '; '))
}
& docker info --format '{{.ServerVersion}}' *> $null
$docker = if ($LASTEXITCODE) { 'down' } else { 'up' }
$baseSha = (git -C $wt rev-parse HEAD).Trim()

$agyArgs = @('-p', $briefText, '--model', $Model, '--settings', (Join-Path $wt '.agents/agy-settings.json'))
if ($Conversation) { $agyArgs += @('--conversation', $Conversation) }
switch ($Phase) {
  'readiness' { $agyArgs += @('--mode', 'plan', '--json-schema', (Join-Path $wt '.agents/schemas/readiness.json'), '--output-format', 'json') }
  'build'     { $agyArgs += @('--output-format', 'stream-json') }
  'learn'     { $agyArgs += @('--json-schema', (Join-Path $wt '.agents/schemas/learn.json'), '--output-format', 'json') }
}

$start = Get-Date
$env:DENTISYS_AGY_GUARD = '1'
Push-Location $wt
try { & agy @agyArgs > "$log.out" 2> "$log.err"; $code = $LASTEXITCODE } finally { Pop-Location; Remove-Item Env:DENTISYS_AGY_GUARD }
$secs = [int]((Get-Date) - $start).TotalSeconds

$lines = @(Get-Content "$log.out" -ErrorAction SilentlyContinue | Where-Object { $_.Trim() } | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} })
$result = if ($Phase -eq 'build') { ($lines | Where-Object event -eq 'result' | Select-Object -Last 1).result } else { $lines | Select-Object -Last 1 }
$requested = @()
if ($Phase -eq 'build') {
  $requested = $lines | Where-Object { $_.step_update.tool_name -eq 'swarm' -and $_.step_update.state -eq 'DONE' } |
    ForEach-Object { $_.step_update.tool_info.parameters } | Where-Object { $_.action -in 'add', 'model' } |
    ForEach-Object { "$($_.name)=$($_.model)" }
}
$brain = Join-Path $HOME '.gemini/antigravity-cli/brain'
$seen = Get-ChildItem $brain -Directory | ForEach-Object { Get-Item (Join-Path $_.FullName '.system_generated/logs/transcript.jsonl') -ErrorAction SilentlyContinue } |
  Where-Object { $_ -and $_.LastWriteTime -ge $start } | ForEach-Object {
    Get-Content $_.FullName | ForEach-Object { try { ($_ | ConvertFrom-Json).model } catch {} }
  } | Where-Object { $_ } | Sort-Object -Unique
$leftover = git -C $repo worktree list | Select-String ([regex]::Escape("antigravity-cli/worktrees/$($result.conversation_id)"))
$protected = git -C $wt diff --name-only "$baseSha" HEAD -- .agents .githooks .claude spec.md AGENTS.md CLAUDE.md CLAUDE.local.md
$protected += git -C $wt status --porcelain -- .agents .githooks .claude spec.md AGENTS.md CLAUDE.md CLAUDE.local.md

$errorLines = @(Get-Content "$log.err" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^(AGY_ERROR|error:|\[agy\])' })
$quotaAfter = Get-GeminiQuota

[ordered]@{
  phase = $Phase; exit = $code; status = $result.status; finished_reason = $result.finished_reason
  error = $errorLines; quota_left_before = $quotaBefore; quota_left_after = $quotaAfter
  conversation_id = $result.conversation_id; wall_seconds = $secs; docker = $docker
  usage = $result.usage; denied_actions = $result.denied_actions
  workers_requested = $requested; models_seen = $seen
  leftover_swarm_worktrees = @($leftover | ForEach-Object { "$_".Trim() })
  protected_paths_changed = @($protected | Where-Object { $_ })
  structured_output = $result.structured_output
  log = "$log.out"
} | ConvertTo-Json -Depth 8
$result.response | Set-Content "$log.response.md"
