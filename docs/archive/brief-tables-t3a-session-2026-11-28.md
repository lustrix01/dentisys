# Brief: Secretary requests, one card per session (T3-a rework, Neon hand-off, emergency mode), 2026-11-28

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: T3-a (rework). Every
product question here is settled: it is the agreed contract. Claude reviews and merges. Emergency mode
(`CLAUDE.local.md`): you also make the demo; the Owner views one offline HTML page.

## Setup (done by Claude; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-tables-polish2`, **detached** at `1eb8d39e`. Commit on the
  detached HEAD; Claude fast-forwards `lighthal9-polish-tables` after review. `npm ci` has run.
- Already committed here on top of `4783c167`: T3-a v1 `b4388426`, T3-b `958b0ff5`, your report `bfbab991`,
  Claude's `c62a51b9` (the request value no longer repeats "Reason:"), T3-c Audit Trail `d7aa2ce8` (with the
  `spec.md` change), T3-d /classes Option A `1eb8d39e`. The Owner approved T3-b, T3-c and T3-d: do not touch them.
- Docker: up (dev stack in `C:\Users\decha\Desktop\Github\dentisys`, `http://localhost:5173`). Accounts in
  `.agents/app.json`. Requests exist on CLINIC-4B (3 pending) as in your T3 captures.
- Reuse `audit-output/tables-polish2/{capture,build-review,check-review}.mjs`; do not write new ones.
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Path per item as that rule says; workers only with `/swarm` and `gemini-4-neon-medium` or `-low`.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Visible changes: only what this brief names, using only the class strings it names or that already exist in
   the file. Anything else goes under "Doubts".
5. Never ask mid-run. A doubt: leave that part untouched, list the exact question, go on.

## Owner's words

"Instead of styling the individual person, style the entire session cards instead. It's not very pleasant to
look that the parent card is not styled. But at the same time, how are you going to style the entire
parent-child card? As it would be redundant styling."

Owner's decision (2026-11-28): **the session is the card; the requests inside are flat rows.** Only one level
carries the card look.

## Item: T3-a rework, build and commit

**Where:** `frontend/src/components/FacultyExcusedRequestsPanel.tsx`, the `groups.map` block (session group
container from `<div key={key} className="overflow-hidden rounded-xl ...">` to its end). Nothing above it
(filters, empty states, dialogs, `PendingRequestsBadge`) changes.

**Contract, all widths:**
1. **The session group is the one frame**, with the ruled-table card look in Faculty green: rounded `1rem`,
   `1px` slate border (`#e2e8f0` / dark `#1e293b`), `2px` green top line, solid white / dark `#0f172a`, the same
   small shadow. These are exactly the `.data-table-ruled.data-table-ruled-clinical` frame values in
   `frontend/src/index.css`: reuse those classes or values; do not invent a new colour, radius or shadow.
2. **Header band** directly under the green line, inside the frame: the existing band (`bg-slate-50
   dark:bg-slate-800/60`) with the group checkbox, label (`course className · date`), count and
   `Approve selected/all` / `Reject selected/all`, unchanged in content, wording and behaviour.
3. **No second frame inside.** Remove the inner padding wrapper (`p-2.5 sm:p-3`).
4. **From 640 px (`!isPhone`):** the table sits directly under the band, edge to edge inside the session frame:
   no own border, no own rounded corners, no own green top line, no own shadow (the session frame has them).
   Keep the table's header row, columns (Student, Requested Change, Reason, Actions), cell padding, column
   rules, row hover, sticky/pinned first column and sideways scroll inside the frame (`table-pin
   table-pin-first`). If the `.data-table-ruled` CSS cannot drop its frame for this one table without a new
   modifier, add one small modifier in `index.css` next to the existing ones (name it `.data-table-ruled-flush`,
   it only removes border, radius, top line and shadow) and say so in the report.
5. **Below 640 px (`isPhone`):** each request is a flat row inside the session frame, rows separated by a thin
   line (`divide-y divide-slate-100 dark:divide-slate-800`), padding `px-3 py-3`. A row has **no** border, no
   left spine, no own background, no rounded corners, no shadow. It keeps everything else it has now: checkbox,
   student number (`text-clinical-800 dark:text-clinical-300`), name, top-right status chip, the shaded value
   box (Requested Change, Reason, Decision when decided), the note input and the bottom-right Note / Approve /
   Reject buttons.
6. Keep on each row/`<tr>`: `id={`secretary-request-${request.id}`}`, `tabIndex={-1}` and the
   `focus:bg-sky-50 dark:focus:bg-sky-950/30` focus tint (the roll-call chip scrolls to and focuses it).
7. Keep every handler, `aria-*` label, disabled rule, wording and the status chip colours as they are.

**Tests:** `e2e/faculty.spec.ts` lines ~1560–1665 (Secretary requests). Row locators (`getByRole('row')`)
must keep working at desktop size. The group locator (`panel.locator('div.rounded-xl')`, ~1659) must find the
new session frame: update it to the new wrapper if its classes change, keeping each assertion's meaning and
strength; never delete an assertion. Name each test change in the report.

**Commit:** `feat(ui): Secretary requests: one card per session, flat rows inside (T3)` with body lines
`Contract: docs/archive/brief-tables-t3a-session-2026-11-28.md` and
`Demo: none - offline HTML audit-output/tables-polish2/review.html (T3-a section)`.

## Demo (same offline page)

Update `audit-output/tables-polish2/review.html` with `build-review.mjs`:
- Replace the T3-a section: **Before = T3-a v1** (the app at `1eb8d39e`, nested request cards) | **After = this
  rework**, real screenshots of `/attendance` → Secretary requests (CLINIC-4B, 3 pending) at iPhone 393 light
  and dark, 640x900, iPad 820, Desktop 1920 light and dark. Also one After shot with a Note input open and one
  of the Approved filter (decided rows, if any exist; say so if none).
- Justification box: what changed, what stayed, anything that looked wrong.
- Mark T3-b, T3-c and T3-d as "Approved, committed" with their shas (`958b0ff5`, `d7aa2ce8`, `1eb8d39e`);
  their shots stay as they are.
Check: no console errors, no broken images (`check-review.mjs`), one check screenshot you open yourself.

## Gates (once, on the final tree)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend`.
2. The Secretary requests tests alone first: `npx playwright test e2e/faculty.spec.ts -g "Secretary"` (output
   to a log file; if the title filter misses them, use the line numbers).
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (output to a log file). This also covers
   the T3-c and T3-d commits, which have not been through `check.ps1` yet: list any failure there under Doubts,
   do not fix it.
4. No `check-postgres.ps1` (no backend, database or `e2e/live` change).

## Report

Append a section "T3-a rework (2026-11-28)" to `docs/archive/report-tables-polish2-2026-11-27.md`: path
chosen, commit, test changes, whether `.data-table-ruled-flush` was needed, device checks, gate results,
Doubts. Commit it as `docs(archive): T3-a session card rework report`.
