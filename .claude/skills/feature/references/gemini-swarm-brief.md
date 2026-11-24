# Brief template: work for the Owner's Gemini (Antigravity) orchestrator

The Owner hands the brief to a Gemini orchestrator that splits it across a swarm of workers. The brief is committed as `docs/archive/brief-<branch>-<date>.md`. Example: `docs/archive/brief-polish2-2026-11-23.md` (14.4, 14.9).

What the first run (polish2, 2026-11-23) showed: the 4 workers needed 40 minutes. Setup before them took 21 minutes, and gates after them took 62. Two of the three merge fixes came from gaps in Claude's brief, not from Gemini. This template closes those gaps.

## Before writing the brief (Claude)

1. **Set up the worktree yourself:** `git worktree add <path> <branch>`, then `npm ci` in the root and in `frontend/`. The brief names the folder. The orchestrator does no setup.
2. **Check the spec for conflicts:** for every rule the brief adds, use the Grep tool on `spec.md` and `docs/contracts/` for sentences it contradicts (polish2's NTF-002 contradicted GRD-004). Get the Owner's exact replacement sentences and put them in the brief.
3. **Check for overlap:** list the files the parallel Claude branch also touches. Give them to one side, or name them as expected merge conflicts.
4. **Write the test contract:** for each item, the test cases and the expected results, so the test worker and the code worker start at the same time.

## Brief sections

1. **Rules for every worker:** copy them from the polish2 brief: worktree only, no visible design change unless the item says so, files listed per worker, commit-message rules, UTF-8 without BOM, every behaviour change has a test that fails before the change.
2. **Swarm plan:** a table with one row per worker:

   | Worker | Item | Role | Owns these files (only these) | Starts after | Model |
   |---|---|---|---|---|---|
   | tests-14.4 | 14.4 | tests from the test contract | `e2e/faculty.spec.ts`, ... | start | medium |
   | impl-14.4 | 14.4 | code | `frontend/src/pages/faculty/Reports.tsx`, ... | start | medium |

   - A file has exactly one owner.
   - Test and code workers both start at once from the test contract.
   - Only the final run of the tests against the code waits for both.
3. **Items:**
   - for each item: the change, the file paths and line hints, and the test contract;
   - any spec text, verbatim;
   - any wording, verbatim. In-app notice text names pages by their sidebar label (polish2 wrote "Face Flags" for the page called "Face Enrolments").
4. **Gates (run once, by the orchestrator, after every worker is done):**
   - Run `check-postgres` first, then `check.ps1`, both with `pwsh -NoProfile -ExecutionPolicy Bypass -File`, output to a log, reading the exit code and the failing lines.
   - Isolate from Claude's gates, which run at the same time:
     `scripts/check-postgres.ps1 -ComposeProject dentisys-integration-<tag> -BackendHttpPort 28080 -FrontendHttpPort 25173 -MailpitUiPort 28025`.
     `<tag>` is lowercase letters, digits and dashes. Any other prefix fails the backup/restore guard at line 238, about 6 minutes in.
   - The `web` check container mounts `backend/`, `database/` and `tests/` only. A `tests/backend` test that reads `spec.md` must guard the read with `file_exists`.
   - One run with `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'`, fix every failure in one pass, then one confirming run.
   - Known flaky tests and existing failures (record them, do not debug them): `e2e/dfd_verification.spec.ts:43` (flaky) and `e2e/live/grade-submission.spec.ts:154` (fails every run, backlog 9.32), plus any the brief adds. Check the backlog's 9.21 and 9.32 lines before copying this list.
   - The new contract tests and `npx tsc -b` run inside the worktree's `frontend/`. Never call bare `npx tsc` elsewhere: it tries to download the npm package `tsc`.
5. **Report (the only handoff):** `docs/archive/report-<branch>-<date>.md`, committed last. It is a factual record:
   - shas;
   - files and behaviour per item;
   - tests with their fail-before / pass-after evidence;
   - gate commands, results and stamps;
   - flaky tests seen;
   - files that overlap the other branch;
   - anything skipped or unsure.

   No instructions for Claude, and no second pasted copy: the Owner tells Claude the report's path.

## After the run

Claude merges the branch with the `colleague-merge` skill and checks the report against the diff, not the other way around.
