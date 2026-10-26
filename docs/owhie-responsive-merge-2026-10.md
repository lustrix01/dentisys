# Owhie's responsive changes merged, October 2026

Owhie's branch `owhie-responsive` (`6c6e3d2`, one commit on top of `7861308`) was merged into `lighthal9-responsive` on 2026-10-26, with the defects found in review fixed in the same merge. The Owner approved the result after a three-way comparison of every change and a Before/After demo of the dropdown fixes.

- Review of his branch (Before/After, verdict per change): [Owhie Branch Review](https://claude.ai/artifact/C5aM3UJaWndTtU4xRucLbb)
- Three-way comparison (your branch, Owhie's branch, fixed merge): [Owhie Responsive Merge](https://claude.ai/artifact/McHi4imDWtMcRDxCAij7Xj)
- Dropdown fixes found afterwards: [Dropdown Arrow Fixes](https://claude.ai/artifact/TWBs4b4UpWWfbY7TkwB6DB)

## Taken as Owhie built it

- Phones show the page name with its icon under the top bar; the top-bar title is the same text (one `h1` visible at every width).
- Grade Computation: a School year dropdown; past-year classes open on Summaries & Export only, with a view-only notice and no Recompute (CLS-002).
- Grade Computation, Reports, Email Management and Retention: one Class dropdown instead of separate course and section dropdowns, inside a filter card above the tabs. Email Management filters by class-section id.
- Audit Trail: no title block in the page; filters in a 2-column grid on phones; Export CSV / Print PDF inside the filter card.
- Student pages: Student ID and the Daily Check-In / Attendance Logs header buttons removed (the student number stays on Profile and Face Registration).
- Class cards show a Lecture / Laboratory / Lecture & Laboratory chip.
- Landing menu "Features" (was "Clinical Features") with a soft purple background; login form in a card on phones.
- Shared spacing: cards and modals never overflow the screen; smaller phone padding; 44 px modal close button; Create Class / Import Roster fill the width on phones.

## Changed or fixed during the merge

| Owhie's branch | Merged |
|---|---|
| Attendance Logs used the `History` icon without importing it; the app did not build | Import restored |
| Audit Trail Newest / Oldest sort removed | Sort restored inside his filter grid |
| Class dropdowns read code - title - section; on phones the section was cut off | Read code · section · title |
| Dropdown text ran under the arrow (class, school year, Audit Trail, student logs) | Text stops before the arrow, cut cleanly |
| Retention tabs scrolled sideways (Midterm Watchlist cut off); Email tabs squeezed to 10 px over two lines | Tabs wrap as whole tabs onto a second row |
| On `/faculty/classes` the page title read "Dashboard" | Reads "My Classes & Rosters" with its icon |
| "Newest first" split over two lines at 320 px | Stays on one line |
| (older, not his) Grade Computation "All Categories" under its arrow beside the search box | Category filter sits under the search box |
| Mocked browser tests ran without Tailwind styles | `scripts/test-e2e.ps1` starts Vite from `frontend/`, so tests see the styled page |

## Owner rulings

- A contract may bend when the new screen is better; breaking a contract and making the screen worse is not accepted. The audit contract was amended for the new filter card (docs/contracts/audit-logging.md, 2026-10-26).
- When a dropdown's text does not fit, it stops cleanly before the arrow (no "…").
- Class dropdown options read course code · section · course title.
- Removing the Student ID and header shortcuts from student pages is accepted.

## How it was checked

- Type check; 170 unit tests; 241 mocked browser tests, now run with styles (tests updated only where an approved change moved a control; 2 timing races fixed with waits, no assertion weakened; 2 live specs updated the same way); `scripts/check.ps1`; `scripts/check-postgres.ps1`.
- Every line Owhie added was compared with the merged code: apart from class names, only the items in the table above differ.
- A new device-audit check finds dropdown text that reaches the arrow: 42 findings before the fixes, 0 after (320, 390, iPad Mini, 1280, 1920; every signed-in role).
- Real screenshots of all three versions on the same database.
