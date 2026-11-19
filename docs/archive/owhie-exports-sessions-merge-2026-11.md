# Owhie's exports, confirmations and session scheduling merged, November 2026 (P3)

Owhie's branch `owhie-responsive` (`030c315`, three commits started from `6a9843a`) was merged into `lighthal9-superadmin` on 2026-11-19 (merge `b30a309`, browser tests `44675bc`), and pushed as `lighthal9-responsive-merge`. The Owner ruled on each review item one at a time and approved the result after a three-way comparison on 2026-11-19.

- Three-way comparison (your branch, Owhie's branch, merged), Faculty screens on laptop and phone: [P3 Merge Comparison](https://claude.ai/artifact/VukjkSTXNo86RgYW5XtUQB)

Owhie's commits: "Improve faculty exports and page layouts", "Add confirmations for important faculty and student actions", "Customize session scheduling and room selection". The Owner approved all of Owhie's `spec.md` and contract edits.

## Taken as Owhie built it

- Grade Computation: the Summaries & Export tab is now **Grade Sheet**, with a one-sheet comprehensive Grade Sheet Excel export and a two-page PDF. The grade-sheet import is retired.
- Full Matrix toolbar: search and filters in one panel, student count in its own chip.
- Confirmation pop-ups get an icon and a colour for each kind of action: red for delete or remove, amber for archive or reset, green for the rest. They also get a "Review this action" panel and larger buttons.
- New confirmations before an attendance correction, sending Student invitations, appointing Class Secretaries, saving a remedial or cost-recovery result, and a Student joining a class.
- Faculty Reports: Grades & Assessment Summary and Analytics exports rewritten; the tab is renamed Retention & Remedials.
- Retention: Midterm Watchlist renamed **At-Risk Students**; slimmer Remedials rows, with details in the Details dialog.
- Email Management: recipients filtered by Course + Class Section (the All students filter is gone).
- Start/Schedule Session: any date can be picked; meetings on that weekday are highlighted and prefill times and room.
- Room list: **Other place (custom)** opens a Custom room or place pop-up instead of an inline text box.

## Changed during the merge

| Owhie's branch | Merged |
|---|---|
| Every room or time overlap blocks Start/Schedule ("Session cannot be created") | Overlaps with another Faculty member still block; when every overlap is with the same Faculty member's own classes, the pop-up asks Book anyway (server, pop-up, spec ATT-001, session contract) |
| Grade Computation Export Excel tooltip described the old multi-sheet workbook | Tooltip describes the one-sheet comprehensive export |
| Email filter test written for the old page; `studentOptions` helper left unused | Test follows the Course + Class Section page; helper removed |
| Past-class saved-breakdown export test removed | Test restored |
| `features.md`: stale Assessment Scores line, Faculty Reports in the iBU/LAST-First sentence, join-code test status changed | Stale line removed, Faculty Reports taken out of that sentence, join-code status restored |

`spec.md` conflicts kept our Superadmin room and defined-term wording together with Owhie's changes.

## Owner rulings

1. Update the email filter test to Owhie's page and remove the unused helper.
2. Allow joint sessions again when every overlap is the Faculty member's own (spec ATT-001 line approved 2026-11-19).
3. Keep Owhie's slimmer Remedials rows.
4. Restore the past-class saved-breakdown export test.
5. Match the Export Excel tooltip to the one-sheet export.
6. Fix the three `features.md` lines.

## How it was checked

- `scripts/check.ps1` and `scripts/check-postgres.ps1` passed on `44675bc`. The mocked browser tests were updated to Owhie's screens, along with the live test strings he removed.
- Every line Owhie added was compared with the merged code. Apart from class names, only the overlap block and the tooltip differ (rulings 2 and 5).
- Real screenshots of all three versions against the same local database, Faculty account, laptop 1440 and iPhone 13. Not shown: the new confirmations (on the old branch they act at once), a live overlap (covered by the database and browser overlap tests), and remedial rows (no remedial records in the local data).
