# Claude → Gemini 4 Neon hand-off through `agy`: proposal (2026-11-26)

Exploration on one real case: a tests-only contract (add a "Philippine mobile edge cases" test for
`normalizePhMobile` to `frontend/src/tests/fieldNormalization.test.ts`). agy 1.5.17, Neon high.
Every result below came from a run; nothing is inferred unless marked "not tested".

## Recommendation (option 1)

Claude runs `agy -p` in the background with `stream-json` output to a file, a per-brief `--settings`
allowlist of exact commands, and a workspace guard hook that hard-denies everything else. Claude is
woken when agy exits, reads the `result` event, reviews the diff and runs the gates. Follow-ups go to
the same Neon conversation with `--conversation <id>`. The Owner pastes nothing.

```powershell
$env:DENTISYS_AGY_GUARD = '1'   # turns the guard hook on for this process only
agy -p (Get-Content brief.md -Raw) --model gemini-4-neon-high --settings set.json --output-format stream-json > run.ndjson
agy -p (Get-Content followup.md -Raw) --conversation <conversation_id> --model gemini-4-neon-high --settings set.json --output-format json > run2.json
```

`set.json` (written by Claude per brief; one exact rule per check the contract names):

```json
{"enableTerminalSandbox":false,"agentMode":"","toolPermission":"request-review",
 "permissions":{"allow":[
   "command(node frontend/node_modules/typescript/bin/tsc -b frontend)",
   "command(node --experimental-strip-types --test frontend/src/tests/fieldNormalization.test.ts)"]}}
```

Guard: `.agents/hooks.json` (PreToolUse on `run_command`) runs `.agents/scripts/agy-handoff-guard.mjs`.
With `DENTISYS_AGY_GUARD=1` it denies any command that is not one of: the tsc line above, a
`node --experimental-strip-types --test frontend/src/tests/<file>.test.ts` line, `git status`, `git diff`;
it also denies `; & | < > $( )` and backticks. Without the variable it answers `allow`, so the Owner's
own agy sessions are unchanged. `.agents/` is in `.git/info/exclude` (local, never committed).

### Measured (the real case)

| Run | Wall time | input | output | thinking | cache_read |
|---|---|---|---|---|---|
| Hand-off: Neon read, started 1 subagent, reviewed, ran `git diff` | 111 s | 30,014 | 7,678 | 6,596 | 90,382 |
| Follow-up via `--conversation` (3 checks, final report) | 40 s | 8,042 | 1,285 | 758 | 90,663 |
| Two follow-ups denied before the allow rules were right | 9-10 s each | ~3,000 each | | | |

Usage is cumulative per conversation; the follow-up row is the difference. Worker tokens are not inside
these numbers (shown for a swarm worker, whose usage is only in its own transcript). No cost field. Probes on
`gemini-3.8-flash-low`: ~20k input, 5-20 s each.

Result: 1 file, +10 lines, 7 cases, all matching current code. Claude's review agreed; Claude's gate
(`npx tsc -b`, the focused test 3/3, `git diff --check`) passed. Not committed.

## The five questions

1. **Hand-off: works.** Background run, exit wakes Claude, `result` holds `response`, `usage`,
   `duration_seconds`, `conversation_id`, and `denied_actions` when something was refused.
2. **Mid-run messages: partly.**
   - `stream-json` output streams `step_update` events (each tool call with its command and output,
     text deltas, `subagent_info`) to the file while Neon works. Claude can watch that file, but is not
     woken by it unless a Monitor is set (not tested).
   - `--input-format stream-json` keeps one conversation open across several user messages (tested:
     turn 2 remembered turn 1), one `result` per turn. It cannot interrupt a running turn.
   - `agy acp` (tested with a small client script) streams progress and sends a
     `session/request_permission` for each tool call that the client answers live. This is the only
     real mid-turn channel. The `-p` form must be `-p=""` when stdin carries the prompts.
   - Neon cannot ask a question in `-p`: headless runs settle the choice themselves (changelog), so the
     brief tells Neon to list doubts in its report. It did ("Doubts").
   - `--remote-control` is a browser view for a person (registers the machine with Google); it gives
     Claude nothing. Not started.
3. **Shell access: works for an exact allowlist without `--dangerously-skip-permissions`; wide access
   needs the guard (see [the plan](agy-swarm-handoff-plan-2026-11.md)).**
   - The account now gets Auto mode by default (`agentMode: auto`): headless Neon ran `whoami`,
     `node -e`, `rm` with no rule, inside a sandbox with no network and no shell writes. `npx tsc -b`
     fails there (it cannot write `.tsbuildinfo`); file edits through Neon's write tool still work.
   - With `agentMode ""` and the sandbox off, only allow-listed commands run; others are denied and
     listed in `denied_actions`. Exact, prefix (`command(git rev-parse)`) and `regex:` rules work; the
     prefix rule `command(node --experimental-strip-types --test)` did not match (cause unknown), and
     `git worktree add ../<dir>` is refused as out-of-workspace even with an allow rule.
   - `--settings` rules are added to the 1,048 shared rules from the Antigravity app, which include
     `command(powershell)`, `command(cmd)`, `command(npx)`, `command(git commit)`, `command(git checkout)`.
     A `--settings` deny rule did NOT override a shared allow (tested on `git log`), though the docs say
     deny wins. The guard hook's deny did override it. So the hook is required, not optional.
   - The hook's `auto_approve` reply did not grant permission by itself; the allow rule is also needed.
   - `run_command` has no working-directory parameter in this build: every command runs from the
     repo root. `npx tsc -b` at the root downloaded an unrelated npm package named `tsc` (seen once,
     before the guard blocked it); the allowlist uses `node frontend/node_modules/typescript/bin/tsc`.
4. **Workers: yes, but only `/swarm` can use Neon medium/low.** Neon started one subagent headless
   with `invoke_subagent` (type `self`), which ran on Neon high: its `Model` only accepts `inherit`,
   `flash`, `pro`, `flash_lite`. Headless `/swarm` works and takes a model id (a worker ran
   `gemini-4-neon-low`, checked in its own transcript; coordinator 47.5k input tokens, the worker's
   18.7k are not included in the coordinator's `usage`). Each `share` worker gets its own git worktree
   and branch under `~/.gemini/antigravity-cli/worktrees/`. `agy agents` lists nothing; `--agent` would
   only pick one from `.agents/agents/*.md`. Whether the workspace guard hook covers swarm workers is
   not shown (see the plan).
5. **Review loop: kept.** Claude read the diff against the contract and `phMobile.ts`, then ran the
   repo gates itself. Neon's own check results are a report, not proof.

## Options, ranked

1. **Background `agy -p` + exact allowlist + guard hook (recommended).** Proven end to end above.
   Manual: nothing for the Owner. Claude writes `set.json` per brief. Limits: no mid-turn questions;
   commands that need Docker (`check.ps1`, `check-postgres.ps1`) stay with Claude.
2. **ACP driver script.** A Node client (probe exists) runs the turn, answers each permission request
   from the same allowlist, and writes progress and Neon's questions to a file that a Claude Monitor
   watches. Gives a live channel and an allowlist enforced by Claude's own code. Not built:
   about 2-3 h plus one real run.
3. **Multi-turn `stream-json` stdin driver.** One process, several turns. It adds nothing over
   `--conversation` resume for Claude, which is simpler.
4. **`--remote-control`.** Useful only if the Owner wants to watch Neon from a phone. Not for Claude.

## Stays manual / open for the Owner

- Approve keeping `.agents/hooks.json` + the guard script (local, uncommitted), and whether the
  routine goes into `CLAUDE.local.md` (not changed).
- The shared Antigravity allow list (1,048 rules incl. `command(powershell)`, `command(git commit)`)
  applies to the Owner's own agy sessions. Pruning it is the Owner's call.
- Neon's doubt: `normalizePhMobile('()- ')` returns `''` (blank) instead of `null` (invalid). It is a
  product decision whether that is right.
- The 7 new test cases are uncommitted in `frontend/src/tests/fieldNormalization.test.ts`: keep and
  commit (`test:` commit) or discard.
