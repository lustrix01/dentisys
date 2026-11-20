# Owhie's layout fixes, retention tick-and-send and confirmations merged, November 2026

Owhie's branch `owhie-responsive` (`858308e`, one commit from `112b338`) was merged into `lighthal9-backlog` on 2026-11-20. The Owner ruled on each review item, then approved the result after a three-way comparison on 2026-11-20.

- Review demo (branch point and Owhie's branch, one card per change): [Owhie Merge Review](https://claude.ai/artifact/UQeivi3vSouKoGJCqyEPEp)
- Three-way comparison (your branch, Owhie's branch, merged): [Owhie Merge Comparison](https://claude.ai/artifact/EGxhyk6zZt3KRrMyyxA7KQ)

Owhie's commit: "fix(ui): refine portal layouts and confirmations" ("Owner-provided screenshots and direct requests define these UI changes."). His note to the Owner: reduce all-capital text because it looks AI-generated, so his casing changes are intended.

## Taken as Owhie built it

- 9.22 layout batch: shorter desktop header with a 44 px Home breadcrumb target; collapsed sidebar labels fit at iPad 820; Audit Trail role on its own line at 320 px; Faculty Reports Retention & Remedials list as phone row cards.
- The page you are on is a link in the breadcrumb on every page except the Dashboard (Owner kept it; backlog 9.27 asks Owhie why).
- 13.5: Faculty Retention Monitoring puts the grade right after Student on all three tabs; At-Risk Students and Remedials have row checkboxes and Send advisory / Send remedial notices, which open Email Management with those students ticked (several `enrollment` ids in the link, Midterm Advisory tab supported).
- 13.6 hint: "You can change the date and time." in Start Session.
- 13.7 confirmations: single-row Approve/Reject of Secretary requests, class join Approve/Reject and the Code On / Auto-Approve switches, Superadmin Restore of a course, room or room category.
- 9.25 Secretary dialog: the label reads "Reason (at least 8 characters)" and "Send for approval" stays clickable; a short reason shows "Provide a reason of 8–500 characters." and sends nothing.
- Capitals removed from about 40 small labels (session strip, Start Session, Gradebook filters, confirmation dialog, chips); "S.Y.:" reads "School year:".
- Roster import: "Download sample CSV" removed; the CSV error points to the column headings or the official class list PDF.
- 9.21: the flaky Email Management test opens the page through its sidebar link.

## Changed or replaced

| Item | Owhie's branch | Merged |
|---|---|---|
| R2 Roll-call table headers (Faculty and Secretary) | Lost small capitals, so one header row mixed two styles and `tableHeaderContract` failed | Small capitals restored on those two headers |
| N2 Auto-Approve on | "Turn automatic approval on for this class?" | Adds "Anyone with the code joins without review." (13.7 item 4) |
| N1 Save grade weights | Unchanged (it already asked before saving) | Message reads "Save these grade weights? Every student's grade in this class is recalculated with them." (13.7 item 3) |
| N3 Sample CSV helper | `getSampleRegistrarCSV` left unused | Deleted |

## Owner rulings

- Capitals (standing ruling in `.claude/skills/ui-fix-demo/references/dentisys.md`): CSS capitals only on table column headers, the printed class list and the emphasised red action button of a dialog that needs it (Cancel · RETIRE, DELETE, CONFIRM); everything else in its normal casing. A research pass found design systems use colour and wording, not capitals, for emphasis; the Owner chose capitals plus red for users. The remaining places are backlog 9.28.
- Breadcrumb current-page link: kept for now (9.27).
- 13.7 items 3 and 4: completed in this merge. Sample CSV removal: kept.
- Secretary reason label (R1): matches backlog 9.25.

## How it was checked

- Owhie's branch alone: type check passed; 1 unit test and 9 mocked browser tests failed and all passed on `112b338` (each traced to a change above).
- Merged tree: `npx tsc -b`, 351 unit tests, full mocked browser suite 348 passed (1 flaky, passed on retry). Tests updated for the new behaviour (Secretary short reason, Student nav scope, confirmations) and added for each 13.7 confirmation: Cancel sends nothing, confirming sends exactly one request.
- Real-app screenshots of every change on laptop and phone, three sides.
- `./scripts/check.ps1` and `./scripts/check-postgres.ps1` on the merge commit.

Not shown on screens: Superadmin restores (Owhie's branch predates the Superadmin sign-in page; covered by tests) and ticked 13.5 rows (no at-risk or remedial students in the local data).
