# Brief: tables (Neon hand-off, emergency mode), 2026-11-27

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: T1, a new table
style piloted on one page. Every product question in this brief is settled: it is the agreed contract.
Claude reviews and merges the result with the `colleague-merge` skill. Emergency mode (`CLAUDE.local.md`):
you also make the options demo; the Owner views your Antigravity artifact, not a Claude page.

## Setup (done by Claude's driver; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-tables` on branch `lighthal9-responsive-tables`, from
  `lighthal9-responsive` at the commit that adds this brief. `npm ci` has run in the root and in
  `frontend/`. It is your workspace root.
- Docker: up (the dev stack in `C:\Users\decha\Desktop\Github\dentisys`, backend reachable through
  `http://localhost:5173`). Seeded accounts are in `.agents/app.json`; the Superadmin signs in with a code
  from its dev authenticator secret there (one code per 30 s).
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Choose the path (direct / one worker / swarm) as that rule says. Start workers only with `/swarm` and
   `gemini-4-neon-medium` or `gemini-4-neon-low`; never `invoke_subagent`.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Visible changes: only on the page T1 names. Anything else that seems needed goes under "Doubts".
5. Never ask mid-run. A doubt during the build: list the exact question in the report, go on.

## Items

### T1 Table style options, pilot page Superadmin Course Catalog (`/superadmin/course-catalog`)
- **Owner's request:** "We need to make our tables responsive, but we also need to style it. Right now,
  it's very crude and looks like it doesn't have any styling. Let's figure out a way to clean our tables
  and style them and make them responsive across our device list." Pilot on one small page first; the
  look the Owner picks becomes the "table bodies" standard (`docs/frontend.md` "Page patterns" says
  "Not settled yet: table bodies") and is rolled out to the other tables later, in another batch.
- **Problems measured today:** Desktop 1920: rows very tall and airy, numbers left-aligned, the page reads
  as unstyled. iPad 820: codes split over two lines (`GS-` / `MWP95WUJ`), "7 (3 this year)" wraps, the
  Actions column is cut off. iPhone 393: each course card fills almost a whole screen (about 1.3 courses
  visible).
- **Rejected by the Owner (2026-11-27, "it got worse"); do not reuse any of these:** tinted accent chips
  behind course codes; Edit/Archive icons without their grey boxes; tighter rows with centred numbers and
  a two-line Classes cell; phone cards that fold the values into one wrapped "Label value" line and drop
  the Active/Retired chip; a sideways-scrolling table on phones (at 393 px only the code and title showed,
  no actions).
- **Contract:** make two options (A recommended, B) that fix the three measured problems. Keep every
  field, action, sort control and wording; keep the header contract (`docs/frontend.md` "Table header
  cells", `frontend/src/tests/tableHeaderContract.test.ts`) and the pinned-columns rule ("Pinned table
  columns"); codes and IDs never break; tables scroll sideways inside their card, never the page; no new
  colour outside the Superadmin/accent palette. Also follow the standing UI rulings in
  `.claude/skills/ui-fix-demo/references/dentisys.md` "Standing Owner rulings (UI)".
- **Demo:** your `dentisys-ui-demo` skill, label **`Stage 1 Options Demo`**: Before | A | B from real
  screenshots of the running app at Desktop 1920 (light and dark), iPad 820 (820x1180) and iPhone 393
  (light and dark), each with the page toolbar in frame. Then the **`Design Review`** self-audit; drop an
  option that cannot pass with zero Blocker/High.
- **Files:** `frontend/src/pages/admin/CourseCatalog.tsx`; `frontend/src/index.css` only for a shared table
  class (name it in the report).
- **Keep no product code:** save each option as `audit-output/tables-neon/A.patch` and `B.patch`
  (`git diff` of the files above), then restore those files so the branch keeps no product change until
  the Owner picks.
- **Done when:** the two artifacts exist and the report lists their paths, the patch paths, and one
  line per option saying what changes for the user.

## Gates

1. `node frontend/node_modules/typescript/bin/tsc -b frontend` with each option applied, before its capture.
2. `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts` with each option applied.
3. No `check.ps1` or `check-postgres.ps1`: no product code is kept in this batch.

## Report (the only handoff)

Write `docs/archive/report-tables-2026-11-27.md` with the `dentisys-handoff` skill, section 4b, and commit
it on the batch branch.
