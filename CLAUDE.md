# Project instructions

## Encoding safety (Windows)

This machine has **PowerShell 7** (`pwsh`) and **Windows PowerShell 5.1**
(`powershell.exe`). They behave differently; use the right one:

- `pwsh` 7 is safe: `Set-Content`/`Out-File -Encoding utf8`, default encodings and
  `>` redirection all write UTF-8 **without BOM**.
- `powershell` / `powershell.exe` (5.1) is unsafe for file writes: `-Encoding utf8`
  adds a UTF-8 BOM, no `-Encoding` means ANSI (mojibake for `ñ`, `é`, `—`, `·`), and
  `>` / `*>` writes UTF-16LE.
- Do not invoke `powershell.exe` for writes. Use `pwsh`, the `Write`/`Edit` tools
  (UTF-8 no BOM), or `.NET`/Node:
  - `[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))`
  - `fs.writeFileSync(path, text, 'utf8')`
- Never `-Encoding utf8BOM`. Never write project text files through a 5.1 `>` redirect.

Existing BOMs are committed in this repo (source files and `.env`); do not add more.
`.env`/JSON/YAML are highest risk because parsers may not strip a BOM.

Guards: a `pre-commit` hook in `.githooks/` blocks commits that introduce BOM /
UTF-16 / mojibake / invalid UTF-8 text, and a `PreToolUse` hook in
`.claude/settings.json` refuses the 5.1 write commands above before they run.
After editing config files, `node .githooks/check-staged-encoding.mjs` verifies the
staged content (run `git add` first).
A `commit-msg` hook in `.githooks/` (rules in `check-commit-msg.mjs`) refuses:
- any AI trailer (`Co-Authored-By: Claude`, `Claude-Session:`, "Generated with Claude Code");
- a `fix:` commit that stages no test file and has no `Test: none - <reason>` line;
- a `feat:` commit with no backlog or spec id in the subject (`(13.3)`, `(GRA-03)`) and
  no `Contract: <where>` line;
- a commit that changes `frontend/src` .tsx/.css files outside tests without a
  `Demo: <artifact link>` or `Demo: none - <reason>` line.

Merge, revert, fixup and squash commits skip all but the trailer rule. A commit that
stages `spec.md` without a `Spec-approved: <date>` line gets a reminder, not a refusal.
The hooks run only in a clone with `git config core.hooksPath .githooks`, and
`--no-verify` skips them: use it only with the Owner's OK.

## Kinds of work

Find the row for the task and follow its routine. When several rows match, follow
each; the heavier routine wins (a bug fix that changes the screen also follows the UI
row). The checks are defined in `AGENTS.md` "Validation".

| Work | Routine | Checks before commit |
|---|---|---|
| Trivial edit: typo, one file, ≲20 lines, no new logic | Edit and commit. | `npx tsc -b` in `frontend/`, or `git diff --check` for text |
| Bug fix | "Fixing bugs" below. | the reproducing test, then `./scripts/check.ps1` |
| How a screen looks: wording, colour, spacing, layout, a new control | `ui-fix-demo` skill; its Route C is the short path for small text, colour or spacing changes. | the skill's demo and design review, then `./scripts/check.ps1` |
| Feature or behaviour change | `feature` skill: contract first (the Owner runs `/grill-me` on it when it touches `spec.md`, the data model, roles or an API contract), a demo when anything is visible, build, tests, then the real built screens before commit. | focused tests, then `./scripts/check.ps1` |
| Spec decision | `AGENTS.md` "Product specification": propose the exact line; edit `spec.md` only after the Owner's OK, in the same commit as the change. | as for the change |
| Database migration | Additive, ordered migration. It must keep working with the previous images, because a rollback ships images only. | `./scripts/check-postgres.ps1`; release step 4 runs it on the demo |
| Dependency, Dockerfile or Compose change | | `docker compose config --quiet`, build the service, `./scripts/check-postgres.ps1` |
| Performance | Measure with `scripts/benchmark.ps1` ([docs/benchmark.md](docs/benchmark.md)) before and after. | as for the code it touches |
| Tests only | | `npx tsc -b` and the changed tests |
| Docs only | Edit current docs in place; dated records go to `docs/archive/`. | `git diff --check` and the documentation contract |
| A colleague's branch | `colleague-merge` skill. | as the skill says |
| Whole-app user audit | `user-walkthrough-audit` skill. | as the skill says |
| Release to demo, then production (a production hotfix too) | [docs/release-guide.md](docs/release-guide.md). | the scripts refuse a commit that has not passed the checks |
| Workflow: skills, hooks, scripts and these instruction files | When a project skill or script falls short, fix it in the same task instead of working around it, test it once on a real case, and commit it as `chore(workflow)`. | `git diff --check`; `node .githooks/check-staged-encoding.mjs` after `git add` |

## Fixing bugs

A bug is fixed only when a test proves it, not when the code looks right.
1. Check the expected behaviour in `spec.md` first. If the fix changes a decision,
   update `spec.md` in the same commit (with the Owner's OK).
2. Typo, wording and CSS-only bugs skip to step 4: a visual check on the demo is
   enough. For every other bug, reproduce it with a test that fails, at the layer that
   broke: a unit test for logic, `tests/backend` or `tests/database` for server and
   database bugs, `e2e/live/` (real backend) for flows. Never prove a server or
   database bug with the mocked `e2e/*.spec.ts` suite: it fakes the server. If it
   cannot be reproduced, say so and ask; do not fix a guess.
3. Fix it; the same test must now pass. Keep the test.
4. Say "fixed" only after the reporter's exact steps pass on the demo site, and name
   the sha that was checked. Before that, say "fixed in code". When the demo cannot
   reproduce it (real user data, a real camera), say "verified on demo except <what>;
   needs the Owner's check on production".
5. After the Owner promotes that sha, remind the Owner to tell the reporter.

## Git

- Commit when the work is validated and, for anything visible, approved by the Owner.
  Push only when the Owner says so. Never force-push, and never switch or merge
  branches without asking.
- Commits are authored as the Owner (Light505) and carry no AI trailers
  (`Co-Authored-By: Claude…`, `Claude-Session: …`, "Generated with Claude Code").
  Cloud sessions add them by default: check `git log --format=%B` on a branch they
  pushed before it is merged.
- Don't touch files the Owner has modified but not committed unless the task needs them.
