---
name: colleague-merge
description: Review a colleague's branch, merge it into ours with its defects fixed, and prove every decision to the Owner with a real-app review demo and a three-way comparison (ours | theirs | merged) before committing, then push and deploy to the demo when told. Use whenever the user says a colleague pushed work, asks to "check what he/she did", review or merge another person's branch (e.g. owhie-responsive, lighthal9-responsive-owhie), compare branches, or "do the merge the same way as last time", even without saying "skill".
---

# Colleague merge

The Owner judges a colleague's work by looking at it, and does not assume it is perfect. Reference runs:
- `docs/archive/owhie-merge-2026-10.md` (layout merge).
- `audit-output/roster-review/colleague-merge-skill-report.md` (roster import; source of this version's fixes).

Flow:
- **0** Preflight.
- **1** Review.
- **2** Review demo → the Owner's verdict.
- **3** Merge.
- **4** Fix.
- **5** Tests.
- **6** Three-way page → approval.
- **7** Gates → commit.
- **8** Push and deploy when told.

Never skip or reorder a step on your own. If the Owner asks to skip one, say in one line what is lost.

Project rules (`AGENTS.md`, `CLAUDE.local.md`) win. Screenshots use the `ui-fix-demo` skill (`shots.mjs`, `verify.py`, `build-demo.py`; `ui-fix-demo/references/dentisys.md` has accounts, routes and UI rulings). Names: **ours** = the Owner's branch, **theirs** = the colleague's branch, **base** = `git merge-base ours theirs`, **S** = this skill's `scripts/` folder, **R** = the session scratchpad.

## 0. Preflight

- **Docker:** run `docker compose ps`. `web` must be healthy on 8080, because screenshots log in against the real backend and `check-postgres` needs Docker. If it isn't, start Docker Desktop, run `docker compose up -d` and wait. Mocked screenshots are a last resort, never a time saver.
- **Tree:** ours must be clean (and ideally pushed).
- **Tools:**
  - The rtk hook summarizes `git diff`/`show`, `ls` and `grep` output. For review diffs use `rtk proxy git …`, and use the Grep tool for searches (never through `node_modules`).
  - Git Bash mangles `/route` args, so use `MSYS_NO_PATHCONV=1` and `C:/` paths.
- **Commands that work here** (PowerShell tool, background, never piped):
  - Mocked browser suite: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/test-e2e.ps1 --reporter=line [specs] *> "<log>"`. Always run it as a child `-File` process: `& script … *> log` in the same process, or inside `-Command`, dies on Node's stderr warning.
  - `scripts/check.ps1` and `scripts/check-postgres.ps1`: run them as they are. The check-postgres log is UTF-16.
- **Sides:** `S/setup-side.ps1 -Name <base|theirs|ours|merged> -Ref <ref|main> -Port <5181-5183> -Root R`. It frees the port, makes or reuses a detached worktree with `node_modules` junctions (`main` = the main checkout), starts Vite (proxying to 8080), and writes `R/app-<Name>.json` for `shots.mjs`.
  - Review: base on 5181, theirs on 5182.
  - Three-way: ours on 5181, theirs on 5182, merged on 5183.
- **End:** `S/cleanup.ps1 -Root R` stops the servers and removes every `wt-*` worktree (junctions first).

## 1. Review (read-only)

- **Inventory:**
  - `git log --oneline ours..theirs` and `theirs..ours`.
  - `rtk proxy git diff --stat base...theirs`.
  - Files both sides touched (`comm -12` of the two `--name-only` lists).
  - Their changelog against the actual commits. Unmentioned files get reviewed hardest.
- **Their intent first** (Owner ruling 2026-11-19; earlier merges "fixed" things the colleague meant to do). The colleague works on the backlog with the Owner's approval.
  - Before judging any hunk, read every commit message (`git log --format='%h %ad%n%B' base..theirs`). Ask the Owner for the colleague's own message or changelog, and quote it in the report as context.
  - Map each finding to its commit (`git log --format=%h base..theirs -- <file>`). Then mark it **Intended** (their message, commit subject, spec, contract or docs edit, or on-screen wording says so), **Unclear** (not mentioned anywhere), or **Defect** (proven broken by a failing test, a crash or wrong data, and nothing else). Being missing from their message makes a finding Unclear, not wrong.
  - Never call a change a bug, and never propose undoing it, because it differs from ours or "looks unintended". Flag every possibly broken item with that mark, its commit, the evidence and what it affects (screen, test or data). The Owner rules on each one.
  - When their intended change breaks one of our tests, the default fix updates the test to their behaviour, not the code back to ours.
  - Present findings one at a time when the Owner asks, with proof. Nothing the colleague added is removed or reverted without the Owner's ruling on that item.
  - AI trailers in their commits (the commit-msg hook sees only the merge commit): `git log --format=%B base..theirs | grep -iE '^\W*(co-authored-by: *claude|claude-session:|generated with \[?claude code)'`. Any hit is a finding: the Owner decides between a squash merge without those lines and asking the colleague to rewrite his branch before the merge.
- **Read every hunk**, logic first:
  - API calls added or removed.
  - Fallbacks that show a missing value as a positive label.
  - Rules dropped from old helpers.
  - Deleted controls.
  - Accessible names and headings removed.
  - Spec or safety wording removed.
  - "Moved" things that were only copied.
  - Duplicate messages.
  - A second copy of the page they missed (e.g. `RealStudentSurfaces.tsx`).
  - Dead Tailwind classes, light grey text.
- **Spec and contract edits:** every hunk of theirs in `spec.md` or `docs/contracts/` is **Needs your OK** by default, even if it says "(Owner <date>)". Quote the claim; only the Owner approves spec changes.
- Check every finding against `spec.md` before calling it a regression.
- **Their gates**, on a theirs worktree:
  1. `npx tsc -b` and `npm test` in `frontend/`.
  2. The full mocked browser suite. Colleagues often run unit tests only.
  3. Always run `S/attribute-failures.ps1 -Log <theirs log> -Base R/wt-base -Root R`. It re-runs exactly the failing tests on base and prints how many are theirs and which pre-exist. It refuses to attribute anything if the base run produced no results.
- **Report:** use template A in `references/briefs.md`. Lead with the verdict, then the findings with ids R/F/N/K.

## 2. Review demo → verdict

- Serve base (5181) and theirs (5182).
- Build the demo with `ui-fix-demo`: Before = base, After = theirs, one card per finding, pills Keep / Needs your OK / Fix / Regression (`.pill.bad`). `shots.mjs` target options:
  - `mock: [{url, json}]` for states the seed data cannot reach. **Copy objects whole**: fetch the real response once (`POST /api/auth/login`, use `access_token`) or take it from the matching `e2e/*.spec.ts`, then edit only what the case needs. A page error fails the target instead of saving a blank image.
  - `fill` and `click` for typing then clicking.
  - `steps` for click sequences.
  - `upload: [selector, absolute path]` for file inputs. Sample files live in R; never commit them or use the Owner's real files.
- Run `verify.py`, read every sheet, build, publish.
- **Conflicts**, without touching the tree: `git merge-tree --write-tree --name-only ours theirs`, then count `^<<<<<<<` per file in `git show <tree>:<file>`.
- Recommend (normally merge, not port by hand), with a rough time, then ask. Never merge before the Owner says so. Owner rulings so far:
  - Removals for a cleaner look are fine when they make sense for users.
  - Actual defects always get fixed.
- **Unanswered Needs-your-OK items:** if the Owner proceeds without ruling, the merge keeps the colleague's version. Mark each item "Needs your OK (pending)" with the alternative, and list them by id in the approval question.

## 3. Merge (sonnet subagent, background)

- You run `git merge --no-commit --no-ff theirs`. The subagent gets brief B (`references/briefs.md`): their layout wins; our class polish is re-applied; no logic changes; checks; stage only.
- Review: `rtk proxy git diff --cached theirs -- frontend/src`, filtered to lines without `className`. It must show only our own earlier commits' changes.

## 4. Fix (same subagent)

- Send brief C: one numbered item per finding the Owner ruled Fix (never Intended or Unclear items without a ruling), with exact behaviour and verbatim wording.
- Review every hunk, then look at the real screens yourself. Screenshots caught what code review missed (a split label, a missing breadcrumb, lost day-room pairing, an unedited page copy, a select-all ticking flagged rows).
- Small fixes (≲20 lines, one file) you make yourself.

## 5. Tests (sonnet subagent, background)

- Send brief D. Its final full-suite run must come after its last edit; if it doesn't, run the full suite yourself.
- Then use the Grep tool on `e2e/live/*.ts` for every removed string and fix those yourself. The subagent can't run live specs, and check-postgres fails late otherwise.

## 6. Three-way page → approval

The three-way page is the approval page. It shows Before (ours), theirs and After (merged), so no separate Before/After is built unless the Owner asks for one (then republish the review demo).

1. Run `python S/survival.py <base> <theirs>` (repo root, merge in the tree). Every line of theirs missing from the merge must match a finding id. Continuation lines of multi-line class strings are class-only.
2. Serve ours (5181), theirs (5182) and merged (`-Ref main`, 5183). Capture each side with the same `targets.json`: `shots.mjs R/app-<side>.json targets.json R/shots-<side> after`.
3. Targets: every row with a screen; a `mock` logic card for each case the seed data cannot reach; laptop and phone close-ups for each Needs-your-OK item (put the alternative in the row text).
4. Write `rows.json` (template E). Statuses:
   - `asis` = taken as-is;
   - `changed` = taken, changed first;
   - `replaced` = not taken, replaced;
   - `added` = added by us;
   - `skipped` = not taken.
5. Run `python S/three-way/contact3.py rows.json <out>` and read every `contact/<key>.png`. Each must frame the right spot, with the theirs column showing what the review said.
6. Run `python S/three-way/build.py rows.json <out>`. It needs a fresh `contact3.ok`.
   - Up to 12 MB of images are embedded: publish the page alone.
   - Above that, publish with `root` = out and `files` = `files.json`.
7. Publish (first time with icon "compare"), and republish to the same file for new versions. Ask one question: approve, listing any pending Needs-your-OK ids.

## 7. Gates → commit (after explicit approval)

- Docker on. Run `scripts/check.ps1`, then `scripts/check-postgres.ps1` (login and authentication UI counts). If a live test fails, fix it and re-run check-postgres; it has no live-only mode.
- Write the change doc `docs/archive/<name>-merge-YYYY-MM.md`, linked from `docs/archive/README.md`, with these sections:
  - taken as-is;
  - changed or replaced (table);
  - Owner rulings, including each Needs-your-OK decision;
  - how it was checked;
  - demo links.
- Commit the merge with a message the Owner understands. No push.

## 8. Push and demo deploy (only when told)

Follow `docs/release-guide.md` steps 2–7. For a merge, step 4 applies when `git diff <old ours>..<merge> -- database` is not empty, and step 6 adds a temporary read-only `e2e/live/zz-<name>-check.spec.ts` asserting the changed screens per role: run it with `demo-test.ps1 <spec>`, then delete it.

## Always

- Finish with `S/cleanup.ps1`, then rewrite the `dentisys-current-state` memory note: commit, pushed or not, demo sha, promote command, rulings.
- Each message starts with the state (step, done, next). Each pause for the Owner ends with exactly one question.
