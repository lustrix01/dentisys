---
trigger: always_on
---

# DentiSys Neon Operations (Antigravity)

Precedence: (1) Owner's current request, (2) `AGENTS.md` and `spec.md`, (3) `GEMINI.md` and this rule.

## Swarm orchestration
- Orchestrator runs on `gemini-4-neon-high`. Choose the path per item and state it with its reason in the readiness answer and the report:
  - **direct** (you edit): `<= 3 files AND <= 150 total changed lines` AND it does not change product code together with its tests (a tests-only or code-only change).
  - **one worker** (a `/swarm` with one worker): one read-only job (recon, critic, one screenshot set) or one larger change of a single kind (code-only or tests-only).
  - **swarm** (2+ workers): two or more independent items, or any item that changes product code together with its tests (implementation and tests always go to separate workers, below).
- **Strict worker model policy (Neon Medium/Low only; never High, never Hydrogen):**
  - `gemini-4-neon-medium`: complex root-cause debugging, multi-state logic, or any brief slot labeled `high` (replaces Hydrogen High).
  - `gemini-4-neon-low`: standard fixes, flaky-test investigation/stabilization, audits, Playwright screenshots, recon, mechanical edits, or any brief slot labeled `medium` (replaces Hydrogen Medium).
  - Never spawn any swarm subagent on `gemini-4-neon-high` or any Hydrogen model.
- **Never share one blind spot between code and tests:** any feature, behavior change, or bug fix that adds/updates tests MUST split implementation and tests across separate `gemini-4-neon-medium`/`gemini-4-neon-low` swarm workers with disjoint file ownership (unless an explicit Owner brief specifies a fixed worker table).
- **Parallel `workspace: "share"` hygiene:**
  - Verify main workspace `HEAD` is clean and matches the target swarm branch commit before spawning `share` workers (they branch from main `HEAD`).
  - Use valid roster names (`a-z`, `0-9`, `-`, `_` only — no dots, e.g. `fix-9-31`).
  - Assign each parallel Playwright worker a unique Vite port (`15181`..`15185`) with a scratch config in `<artifactDir>/scratch/` (never `scripts/test-e2e.ps1`, which hardcodes `15174`), and run `npm ci --prefer-offline --no-audit --no-fund` in parallel with reading files.
  - Windows sandbox `.githooks` fallback: if a worker's `git commit` hits MSYS `sh.exe` `0xC0000022` (or an unsandboxed approval times out), have it keep files staged after passing `git diff --cached --check` + `node .githooks/check-staged-encoding.mjs` and post the exact commit message to `@coordinator` immediately instead of retrying/stalling.
- Assign each file to exactly one worker before spawning parallel edits. Never let a worker choose layout, color, or wording without naming the `docs/frontend.md` "Page patterns" standard it copies.
- **Overlap independent work:** start long setup commands (e.g. `npm ci` in a new worktree) in parallel with reading specs/code, and advance each independent swarm item as soon as its prior phase finishes rather than barrier-waiting on unrelated items.
- Kill finished workers when the task is wrapped up (after merging `--no-ff`).

## Kinds of work
- **Trivial edit** (typo, 1 file, <= 20 lines, no new logic): edit, run `npx tsc -b` or `git diff --check`, commit.
- **Bug fix**: check `spec.md`, reproduce with a failing test at the real broken layer (`tests/backend`, `tests/database`, or `e2e/live/` for server/DB bugs — never prove server/DB bugs with mocked Playwright), fix, confirm the test passes, run gates.
- **Visible UI change**: load `dentisys-ui-demo` skill before committing; real-app screenshots only, never hand-written HTML/CSS mockups.
- **Feature / behavior change**: load `dentisys-feature` skill. In a hand-off run the brief is the agreed contract (Claude and the Owner settled it, `/grill-me` included); do not reopen it.
- **Session wrap-up / high context**: load `dentisys-handoff` skill.

## Gates, encoding, and logs
- Never use Windows PowerShell 5.1 (`powershell.exe`) for file writes or gate stamp writes. Use native `write_file`/`edit_file` (UTF-8 no BOM, preserve CRLF) and run official gates with `pwsh`:
  - `pwsh -ExecutionPolicy Bypass -File scripts/check-postgres.ps1`
  - `pwsh -ExecutionPolicy Bypass -File scripts/check.ps1`
- **Pre-flight Docker check:** Before running `check-postgres.ps1` or `check.ps1`, run `docker info --format '{{.ServerVersion}}'` (1s). If the daemon is stopped, do not wait or ask: finish everything that needs no Docker, and list the gates not run in the report.
- **Inspect traces before rerunning slow gates:** On any Playwright failure in `check-postgres.ps1`, read `test-results/<case>/error-context.md` and inspect `trace.zip` *before* launching a second full gate run (and *before* running `check.ps1`, which overwrites `test-results/`). Never burn a 10-minute rerun hoping a failure is a one-off flake without checking the trace first.
- **Parallel worktree isolation (`check-postgres.ps1`):** When working in a sibling worktree or alongside another agent, always isolate Compose project and ports using a name matching the backup/restore guard regex `^dentisys-(integration|final)(-[a-z0-9-]+)?$`:
  `scripts/check-postgres.ps1 -ComposeProject dentisys-integration-<tag> -BackendHttpPort 28080 -FrontendHttpPort 25173 -MailpitUiPort 28025`
- **Gate order:** On any backend, DB, migration, or `tests/database` change, run `check-postgres.ps1` **before** `check.ps1` so integration fixes never force a duplicate `check.ps1` run.
- **Pre-gate full fast sweep (mandatory before `check-postgres.ps1`):** Before launching Docker `check-postgres.ps1`, run in one pass: (1) normalize CRLF (UTF-8 no BOM) on all changed files in `git status --porcelain` so `test-stamp.ps1` never aborts on LF warnings, (2) `php -l` + **every** `tests/backend/*_test.php` — and run any new/edited backend contract test inside `docker compose run --rm --no-deps web php ...` (the check container mounts only `backend/`, `database/`, and `tests/`, so reads of `spec.md` or `biometric-sidecar/` must guard with `file_exists(...)`), (3) `php tests/documentation/doc_contract_test.php`, and (4) `npx tsc -b` + `npm test` in `frontend/`. Never risk invalidating a 10-minute `.pg` stamp over a 2-second contract test.
- **SQL & integration debug loop:** Before running `check-postgres.ps1`, verify every raw SQL table's exact columns/`NOT NULL`/`CHECK`/`UNIQUE` constraints against migrations and `git grep` `tests/database/` for existing assertions superseded by the behavior change. Keep `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'` across EVERY retry until 0 failures remain (or iterate in one warm running container via `docker compose exec web php ...`), fix all failures in one pass, then run the normal gate once to stamp `.pg`.

## Token & quota discipline
- **Prefix-matchable commands (avoid permission re-prompts):** Keep `run_command` strings clean for Antigravity Allow/`unsandboxed(...)` prefix matching: no `;` chains, no `$VAR`/`$LASTEXITCODE`, no `$(...)`, and no `pwsh -Command "..."` wrappers. Write multi-step or redirected commands into `<artifactDir>/scratch/*.ps1` (or `.mjs`) via `write_file` and invoke `pwsh -ExecutionPolicy Bypass -File <path>` or `node <path>`.
- **Redirect gate logs:** To keep gate output out of chat context without breaking command prefix matching, write a 2-line `<artifactDir>/scratch/run-gate.ps1` wrapper that runs `scripts/check.ps1` or `scripts/check-postgres.ps1` redirected to `<artifactDir>/scratch/*.log` and prints `EXIT=$LASTEXITCODE`, then run `pwsh -ExecutionPolicy Bypass -File <script>` and read only `EXIT` + failing lines / last ~30 lines.
- **Limit multimodal PNGs in coordinator:** Have the `gemini-4-neon-low` demo worker open and verify **every** PNG via `read_file` with exact `scrollWidth <= innerWidth` metrics; coordinator opens only the 4–6 highest-risk PNGs (mobile 393, modals, primary After screens).
- **Avoid premature commits (single-pass tree stamping):** Because `test-stamp.ps1` stamps the exact working tree hash (`HEAD^{tree}`), run `check-postgres.ps1` then `check.ps1` on the exact final uncommitted files (with zero untracked files), then commit those exact files and verify `.git/dentisys-pass/<tree>.pg` and `.check` match `HEAD^{tree}` in one pass.
- **Watch quota:** When coordinator quota drops below ~10%, wrap up or hand off cleanly (`dentisys-handoff`) rather than starting a new multi-step feature.

## Boundaries
- Never push, never read or copy `.env`, `~/.dentisys` or `~/.ssh`, and never run code whose purpose is to get around the guard (`.agents/scripts/agy-handoff-guard.mjs`). Owner ruling 2026-11-26.
- Start workers only with `/swarm` and the model id `gemini-4-neon-medium` or `gemini-4-neon-low`; never `invoke_subagent` (its `Model` cannot select Neon medium/low). The guard refuses anything else.
- Work only on the batch branch and worktree the brief names. Never merge into `lighthal9-responsive` or `lumbang_final`, and never touch demo VPS or `promote-prod.ps1`.
- Commit as `Light505 <181879156+Light505@users.noreply.github.com>` with no AI trailers and full `.githooks/` compliance.
- Never edit `spec.md`, `AGENTS.md`, `CLAUDE*.md`, `.agents/`, `.githooks/` or `.claude/` (the guard refuses). A needed spec or rule change goes in the report under "Doubts" with the exact proposed line; Claude applies it after the Owner's OK.

## Hand-off runs (started by Claude)
- **Never ask mid-run.** Nobody can answer. Readiness pass (plan mode): return every doubt; make no edits. Build pass: a doubt that still appears means that item is left untouched and listed under "Doubts (not acted on)" with the exact question; continue with the other items. Never act on a guess.
- **Commit lines** (`.githooks/check-commit-msg.mjs`): no AI trailers; a `fix:` commit stages its test file or has `Test: none - <reason>`; a `feat:` subject names the backlog id, e.g. `(13.3)`; any `frontend/src` `.tsx`/`.css` change has `Demo: none - Claude shows the real-app Before/After at the merge`. A refused commit: fix the message, never bypass the hook.
- **Wording names what exists:** a notice, button or help text that points to a page, tab or control uses its exact current label (check the route or component before writing it).
- **Docs follow behaviour:** a behaviour change updates the current docs it contradicts (`docs/` outside `docs/archive/`, contracts, README) in the same commit; a contradicting `spec.md` line goes under "Doubts".
- **Report** (`dentisys-handoff` skill, section 4b) adds: "Path chosen" per item with its reason, "Worker models" (name and model id per worker), and "Doubts (not acted on)".
