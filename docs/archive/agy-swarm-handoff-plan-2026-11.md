# Plan: Claude plans, Neon high builds, Claude merges (2026-11-26, revised after verification)

Builds on [agy-handoff-proposal-2026-11.md](agy-handoff-proposal-2026-11.md) (what was measured) and the
review of 16 past Antigravity coordinator runs (Nov 22-24). Branch names are not in this plan: the Owner
names the branches for each batch. Owner decision (2026-11-26): wide command access inside the batch
worktree.

## The workflow it delivers

1. **Plan here.** Claude and the Owner pick backlog items, settle every product question, batch them,
   and split them: Claude's share and Neon's share (UI work may go to either). Claude writes one brief
   per batch to `docs/archive/brief-<batch>.md` with the "Swarm plan" table (files owned, exact model id).
2. **Prepare (Claude's driver script, no Owner step).** Creates the batch worktree on the branch the
   Owner named, runs `npm ci`, checks Docker is up and the worktree is clean.
3. **Readiness pass (Neon high, plan mode, no edits).** Neon returns, as schema-checked JSON, the path
   (direct / one worker / swarm), each worker with its model id and files, and every doubt. Claude and the
   Owner answer the doubts here and fold them into the brief. Repeat until there are none.
4. **Build pass (Neon high, background, same conversation).** Neon either edits directly or runs
   `/swarm` workers on Neon medium or low; the swarm creates one git worktree per worker by itself.
   Neon merges the workers' work into the batch branch, runs the gates, commits, and writes the factual
   report. A doubt that still appears: that item is left untouched and listed under "Doubts". It never
   asks mid-run.
5. **Merge here.** Claude is woken when agy exits, checks no worker is still alive, reviews with
   `colleague-merge` (protected paths first), re-runs the gates on the merged tree, shows the Owner the
   real-app Before/After, and merges with the Owner's OK.
6. **Learn, only after the Owner is satisfied with the merged output.** Claude then resumes the same
   Neon conversation (`--conversation <id>`) with a plain "learn from this run" prompt and
   `--json-schema .agents/schemas/learn.json` (`/learn` is not an agy CLI command or skill; it was the
   Antigravity app's). Neon returns ranked proposed fixes (mistake, evidence, file, exact line, what it
   saves) and applies none; the guard blocks writes to `.agents/` anyway. Claude adds its own merge
   findings and shows one ranked list, recommendation first. The Owner picks fixes by number here;
   Claude applies only those and commits them as `chore(workflow)`. Neon never runs a learn pass on its
   own. Why resume Neon instead of Claude drafting alone: Neon's context holds its own retries, denials
   and wasted steps that the report leaves out, a resumed turn is mostly cache reads, and its tokens are
   on the Gemini subscription rather than the Owner's Claude quota. Measured on the 2026-11-26 phMobile
   run: 81 s, about 40k new input and 8k output tokens, 6 grounded fixes, no file changed.

## Verified on 2026-11-26 (one probe each)

| Question | Result |
|---|---|
| Does a PreToolUse hook see the worker model? | Yes. `swarm` add: `{"action":"add","model":"gemini-4-neon-low","workspace":"share",...}`. `invoke_subagent`: `{"Model":"flash_lite",...}`. |
| Can `invoke_subagent` run a worker on Neon medium/low? | **No.** Its `Model` only takes `inherit`, `flash`, `pro`, `flash_lite` (from the agy binary). `inherit` = Neon high; `flash_lite` ran `gemini-3.5-flash-lite`. Only `swarm add` takes a model id. |
| Does headless `/swarm` honour a model id? | Yes: worker ran `gemini-4-neon-low` (its own transcript). |
| Do repo `.agents/rules/*.md` load headless? | Yes (an always-on probe rule was followed). |
| `--mode plan` + `--json-schema` headless? | Yes: `structured_output` returned, no files changed, 24 s on Flash. |
| Can Neon run `git worktree add ../<dir>`? | **No**: refused as an out-of-workspace command even with an allow rule. The driver creates the batch worktree; swarm worker worktrees are created by agy itself under `~/.gemini/antigravity-cli/worktrees/`, each on its own new branch. |
| Does the workspace guard hook fire inside a swarm worker? | **Not shown.** The worker's `whoami` was refused by the permission system, not the hook; most likely because the worker's worktree has no `.agents/` (it is git-excluded, so not in any new worktree). |
| Allow rules in `--settings` | Prefix rules work (`command(git rev-parse)` allowed `git rev-parse --short HEAD`), and so do `regex:` rules. The hook's `auto_approve` does not grant permission. `--settings` deny did not override a shared allow. |
| `share` workers and uncommitted work | A `share` worker's worktree received copies of the main checkout's uncommitted files. |
| Headless coordinator lifetime | One Flash-coordinated swarm run exited right after spawning its worker (left a worktree and branch, cleaned up by Claude); a Neon-coordinated one waited, read the board and killed its worker. |

## Steps to build it

| # | Change | Files | Proof before it is relied on |
|---|---|---|---|
| 1 | Move the `dentisys-emergency` rules and skills into the repo as `.agents/rules/dentisys-neon.md` and `.agents/skills/*`, drop its `current-state.md`, remove `/.agents/` from `.git/info/exclude` and decide what to do with the files already in `.agents/` (`app.json`, `project-profile.md`, `scripts/*`, not Claude's). Committed, so every worktree carries the rules and the guard | `.agents/**` | a swarm worker in a fresh worktree follows a probe rule and is stopped by the guard |
| 2 | **Done, changed** (`.agents/agy-settings.json`): `command(*)` with the guard as the deny layer. A fixed allowlist failed in practice: in a headless run a permission denial ends the whole turn with no output (the readiness pass died on a read-only `git grep`), while a guard denial is returned to Neon and the run continues. The guard runs before the allow rules (it blocked a shared-allowed `git log`) | `.agents/agy-settings.json` | readiness pass ran with no denials; guard denials shown live |
| 3 | Guard hook, second layer, **fail-closed** (a crash or bad input = deny), on `run_command`, the file tools, `swarm` and `invoke_subagent`. Denies: `git -C`, `--git-dir`, `--work-tree`, `-c`, `config`, `push`, `branch -f/-D`, `update-ref`, `checkout`/`switch` of another branch, `reset --hard`, `--no-verify`; `docker` outside the check scripts and any `down -v`, `volume`, `prune`, `run -v`; `powershell`/`powershell.exe` (5.1 writes), `cmd`, `node -e`, `curl`, `ssh`, `scp`, `promote-prod.ps1`; writes to `.agents/`, `.githooks/`, `.claude/`, `.git/`, `spec.md`, `AGENTS.md`, `CLAUDE*.md`; reads of `.env`, `~/.dentisys`, `~/.ssh`; `swarm` add/model with a model other than `gemini-4-neon-medium`/`gemini-4-neon-low`; every `invoke_subagent` | `.agents/hooks.json`, `.agents/scripts/agy-handoff-guard.mjs` (+ test) | unit test per case **and** one live agy run per deny group |
| 4 | Decision rule: **direct** = ≤3 files, ≤150 lines, no new tests; **one worker** = a one-worker swarm (recon, critic, one isolated fix); **swarm** = 2+ items, or an implementation and its tests (separate workers). Briefs name model ids, never tiers. Commit rules from `.githooks/check-commit-msg.mjs` (no AI trailers, `Demo:` line, `fix:` with a test, `feat:` with an id); notice wording names a real page or tab (merge finding F1); a behaviour change updates the current docs it contradicts or lists them as doubts (F2) | `.agents/rules/dentisys-neon.md` | readiness pass on a real brief |
| 5 | Formats: readiness JSON schema; build report = today's factual format + "Path chosen", "Doubts (not acted on)", "Worker models" | `.agents/schemas/readiness.json`, `.agents/skills/dentisys-handoff/SKILL.md` | schema-valid output (already shown on Flash) |
| 6 | Driver script: creates the worktree, `npm ci`, checks Docker and clean tree, sets `COMPOSE_PROJECT_NAME` and ports, writes the settings, runs `agy` **with the worktree as its working folder**, `stream-json` to a log; after exit lists leftover swarm worktrees (resume with `--conversation` if workers are still alive), reads each worker's model from its transcript, and stops if any protected path changed | `scripts/agy-handoff.ps1` | runs both passes on the pilot |
| 7 | Pilot: one real small batch the Owner picks | — | tokens and time per pass; Claude's merge finds no defect a rule covers |

Claude's side stays as `CLAUDE.md` says: Claude does not run gates while Neon's run is active (shared
images, see the state note), and re-runs `check.ps1` (and `check-postgres.ps1` when backend files changed)
on the merged tree, because a stamp is keyed to one tree and Neon's stamp never covers the merge.

**Size.** Steps 1, 4, 5: rule text, about 1.5 h. Step 3: about 200 lines with tests plus the live deny
runs, about 2 h. Steps 2 and 6: about 2 h. Fix cycles: about 1 h. About one working day before the pilot.

## Remaining risk with wide access (Owner accepted wide)

The allowlist and guard stop the commands they see, but a test file or a script Neon writes is arbitrary
code: it can do anything the Owner's Windows account can, including push (GitHub credentials) or read
`.env`. Owner ruling (2026-11-26): accepted, as in the Antigravity app; no separate Windows account.
Step 4's rule file says it in prose: never push, never read or copy `.env`, `~/.dentisys` or `~/.ssh`,
and never run code whose purpose is to get around the guard. The guard and Claude's diff review at
merge stay as the checks.

## Owner decisions still open

1. Retire the global `dentisys-emergency` plugin after step 1 (`agy plugin disable dentisys-emergency`).
2. UI path: Neon captures real-app shots with the moved UI-demo skill; Claude runs `design-review` and
   shows one Before/After at the merge (the Nov 24 path).
3. After the pilot, add a short "Neon hand-off" section to `CLAUDE.local.md`.
