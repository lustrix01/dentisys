# Owhie's landing pages, reports and import changes merged, November 2026

Owhie's branch `owhie-responsive` (`9227e2b`, two commits on top of `c2b1294`) was merged into `lighthal9-responsive` on 2026-11-02, with fixes from the review in the same merge commit. The Owner approved the result after a three-way comparison of every change. Owhie's changes were treated as signals of real user problems: where his version dropped a safeguard, the merge keeps his simpler screen and puts the safeguard back in a new form instead of reverting.

- Walkthrough audit and recheck of the branch: [DentiSys Walkthrough Recheck](https://claude.ai/artifact/NKi4MbAVtYghCjttN3Guez)
- Three-way comparison (your branch, recommended merge, Owhie's branch): [Owhie Branch Merge Comparison](https://claude.ai/artifact/BK7ZzWAWaDKkKxqv8tn8Ho)
- Name review options for Select all (current, smart flags, review every split): [Name Review Options](https://claude.ai/artifact/XcYN41xep4ecwigam4b6Ff)

## Taken as Owhie built it

- Public pages: home page restyle, new About, Features, FAQ and Contact pages with a shared header.
- Login, Forgot password and Reset password restyled as one card with the BU CDM seal; the resend button says "Resend in 60s".
- Faculty Reports, Grades & Assessments: Export Excel and Export PDF give a five-sheet report (assessment scores, grade summary, Midterm Watchlist, attendance register, analytics). The official grade workbook stays on Grade Computation, Export (official-exports X1, X2, X28).
- Class roster view: class list exports as Excel and as PDF (X14, X26, X27).
- "Import Students" in a class roster opens its own dialog that imports into that class only (class-from-class-list N10). The page button is "Import Class and Roster".
- Faculty retention tab and table renamed "Retention Status" (UI-003 naming update).
- Dean and Faculty audit trails: filters behind "More filters"; the search hint is no longer cut off.
- Emails restyled and reworded.
- Two images added to `frontend/public` (not used yet; kept for later).

## Changed or fixed during the merge

| Owhie's branch | Merged |
|---|---|
| "Select all students" ticked every row, including possible crossed-out rows and every name split, and marked them reviewed | Only ambiguous name splits are flagged (no comma, Jr./Sr./II–V, a surname particle, three or more given names). Select all ticks the other rows and never a flagged, crossed-out or error row. A line counts what is left. With a search typed in it says "Select the N shown" |
| Editing any field of a ticked flagged row un-ticked it without a message | Only a name edit un-ticks a flagged row |
| "Review the source and name fields before selecting this row." removed from every row | Shown only on flagged rows, and linked to the row's checkbox for screen readers |
| No target-class picker when a class list matches none of the Faculty's classes | One line says a new class is created, with "Import into one of my existing classes instead", which opens the picker on the first class |
| About page: Administration "oversee user permissions" (no such feature) | "Configure academic terms, invite Faculty, review the audit trail, and generate official reports." |
| FAQ: Class Secretaries "log assessment scores"; the college secretary imports class lists; heading cut off on phones | Faculty record attendance and scores, Secretaries request attendance changes for Faculty approval; Faculty import their class lists; heading wraps |
| spec.md: two identical class-list PDF paragraphs; two 2026-10-17 amendments reworded in place | One paragraph; the 2026-10-17 amendments as the Owner wrote them |
| Tests not updated for the renames (1 unit, 10 mocked, 2 live) | Updated; new tests for the name-split rule, Select all, editing after Select all and the existing-class link |

## Owner rulings (2026-11-02)

- Select all uses smart flags (accuracy first): only ambiguous splits need the Faculty's check, and students correct their own name after activation through Change Name. This supersedes the 2026-10-28 rule that the Faculty reviews every split (spec IMP-001 amendment, class-from-class-list N8a).
- A class list that matches none of the Faculty's classes says a new class is created and offers the existing-class link (class-from-class-list N1).
- Keep the two unused images.
- The other changes (reports bundle, class-list PDF, Import Students dialog, Retention Status, Contact details, More filters, email wording) are taken as Owhie built them.

## How it was checked

- `scripts/check.ps1` and `scripts/check-postgres.ps1` on the merged tree.
- Before that, in a separate worktree: type check, unit tests, and the full mocked browser suite (252 of 252 with 2 workers; with 4 workers, sign-in pages time out under load).
- A walkthrough of every role on the local stack (39 pages, no page-wide sideways scrolling) and real-app screenshots of every changed screen for the comparison page.

## Follow-ups

- Student activation shows only the full name. Showing First / Middle / Last with "Is this right? Change Name" would let students catch a wrong split.
- The walkthrough findings still open on this branch are listed in the recheck page above.
