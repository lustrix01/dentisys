# Brief: <batch name> (Neon hand-off), <YYYY-MM-DD>

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Items: <ids> from
[the backlog](../PRODUCT_BACKLOG.md). Every product question in this brief is settled: it is the agreed
contract. Claude reviews and merges the result with the `colleague-merge` skill.

## Setup (done by Claude's driver; do not redo)

- Worktree `<absolute path>` on branch `<branch the Owner named>`, from `<base branch>` at `<sha>`.
  `npm ci` has run in the root and in `frontend/`. It is your workspace root.
- Docker: <up / down>. If down, skip the Docker gates and list them in the report.
- Parallel Claude work: <none / branch and the files it owns; never touch those files>.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Choose the path per item (direct / one worker / swarm) as that rule says, unless the item below fixes a
   worker table. Start workers only with `/swarm` and `gemini-4-neon-medium` or `gemini-4-neon-low`;
   never `invoke_subagent`.
3. Every command runs from the workspace root with repo-relative paths, e.g.
   `node --experimental-strip-types --test frontend/src/tests/<file>.test.ts`,
   `node frontend/node_modules/typescript/bin/tsc -b frontend`. Never `cd` first.
4. Visible changes: only those an item names, copying the "Page patterns" part it names with its exact
   class strings. Anything else that seems needed goes under "Doubts".
5. Never ask mid-run. A doubt during the build: leave that item untouched, list the exact question, go on.

## Items

### <id> <title>
- **Contract:** <what changes, fields, errors, exact wording, examples>.
- **Files:** <owned files; for a fixed worker table: worker | role | files | model id>.
- **Proof:** <the test that must fail before and pass after, at the right layer>.
- **Done when:** <observable result>.

## Gates (once, after every worker is merged back, `--no-ff`)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend` and the focused tests above.
2. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-postgres.ps1 -ComposeProject dentisys-integration-<tag> -BackendHttpPort 28080 -FrontendHttpPort 25173 -MailpitUiPort 28025`
   when backend, database or `e2e/live` files changed (`$env:INTEGRATION_CONTINUE_ON_FAIL = '1'` for the
   first run).
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`.

## Report (the only handoff)

Write `docs/archive/report-<batch>.md` with the `dentisys-handoff` skill, section 4b, and commit it on the
batch branch.
