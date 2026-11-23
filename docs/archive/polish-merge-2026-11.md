# Polish merge (polish1 + polish2), November 2026

`lighthal9-responsive-polish` was cut from `lighthal9-responsive` (b3d478e) on 2026-11-24. Two branches were merged into it with `--no-ff`:

- `lighthal9-responsive-polish1` (Claude): backlog 14.1, 14.2, 14.6, 14.7, 14.8 (Owner approved, demo https://claude.ai/artifact/QDytYqSX9e35Yp2DBE3uUA), the lean helper agents and their front-matter fix. Merge 358964c.
- `lighthal9-responsive-polish2` (Antigravity, e386492): backlog 14.4 and 14.9. Reviewed with the `colleague-merge` skill; brief `brief-polish2-2026-11-23.md`, its own report `report-polish2-2026-11-23.md`.

The two branches had no merge conflicts. 14.3 and 14.5 are not in this merge.

## Taken as-is

- **K1, 14.4:** Faculty Reports, Retention & Remedials lists only students who were in retention or remedial in the selected school year and class, including those who passed (Cleared). The table, PDF row count, PDF ledger and "Retention list" Excel use the same list.
- **N1:** empty state "No students in retention or remedial for the selected school year." with the page's Inbox empty-state look.
- **N2:** Export Excel / PDF stay enabled when the list is empty.
- **N3:** `spec.md` NTF-002 "In-app notices per role", word for word the polish2 brief (Spec-approved 2026-11-23).
- **K2, 14.9:** six new in-app notices: final grades released, grade changed, class Faculty changed (now also to Students), join request waiting, face revocation request waiting, face enrolment flagged. Active linked accounts only, once per event, never to the actor. New types `grades_released`, `grade_changed`.
- **K3:** "Final grades released" is sent at Submit; a withdraw in the 24-hour grace keeps it; a re-submit sends no second one.

## Changed or replaced

| Id | polish2 | Merge |
|---|---|---|
| F1 | Face enrolment flagged notice ends "Review in Face Flags." (no page has that name) | "Review in Face Enrolments." |
| F2 | Left current docs saying Students get no notice | `spec.md` GRD-004 sentence and the Change Faculty clause now name the NTF-002 notices (Spec-approved 2026-11-24); contracts `superadmin-classes.md` (notices, D14) and `grade-submission.md` (Student row) updated |
| F3 | (not polish2's) live `grade-submission.spec.ts` opened the advisory menu before the publish finished | waits for the "not published" badge to go, like the same test's later step |

## Owner rulings (2026-11-24)

Keep K1, K2, K3, N1, N2; approve N3 as written; fix F1, F2 (exact spec sentences approved in chat), F3. The 14.6 Change Faculty reason length 8-240 (contract D8) is the Owner's rule; `spec.md` says only "with a reason", so no spec edit.

## How it was checked

- polish2's own `check.ps1` pass stamp for its exact files (351c0b0's tree): type check, 364/364 unit, 366/366 mocked browser tests, backend PHP tests.
- Every polish2 hunk read; no AI trailers; `survival.py`: every added frontend line survives the merge.
- Real screenshots of the Retention tab on dev data (2 in remedial, 4 passed, empty), desktop 1440, phone 360 and dark; design review passed.
- After the fixes: `npx tsc -b`, PHP lint, `notifications_per_role_contract_test.php` 27/27.
- `scripts/check.ps1` and `scripts/check-postgres.ps1` on the merge commit (see the `.git/dentisys-pass/` stamps).

## Demo links

- Review demo (base vs polish2): https://claude.ai/artifact/EroASMFbqJeo6U4h99S2Ra
- Three-way approval page (polish1 | polish2 | merged): https://claude.ai/artifact/3ygKFsxkM54pwhgSFqvTia
