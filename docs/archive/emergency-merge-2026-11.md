# Emergency branch merge, November 2026

`lighthal9-responsive-emergency` (the Owner's own work, done with another assistant while Claude was unavailable; handoff: [HANDOFF_2026-11-23_EMERGENCY_TO_CLAUDE.md](HANDOFF_2026-11-23_EMERGENCY_TO_CLAUDE.md)) merged into `lighthal9-responsive` with the `colleague-merge` routine. `lighthal9-responsive` (b296c56) was the merge base, so the merge is a fast-forward with no conflicts.

## Taken as-is

- 9.25: 8-character minimum shown on the remaining reason dialogs (Superadmin Audit Trail revoke, grade change Send for Dean approval, Dean Reject Grade Change), validated on click.
- 9.29: Grade Weights header no longer runs under Reload on phones; Assessments tab sticky header overlap fixed.
- 9.30: Dean Grade Submissions fall back to class term dates when Academic Terms has no matching row.
- 12.9: Student face revocation requests with Superadmin approval, blocked mismatch updates (F2), repeat-revocation flag (F3), the Face Enrolments page (Revoke Requests and Flags tabs) and its Overview row. Migration `072_face_revoke_requests.sql`.
- 12.10: the consent API can no longer delete an enrolled face without approval.
- 12.12 and 12.13: Final grades and Retention Status appear outside Grade Computation only after Submit grades; Midterm advisory publish, update and unpublish. Migration `073_grade_release_gates.sql`.
- spec.md amendments to GRD-004, UI-003, BIO-002, BIO-005, BIO-009 and ADM-001, approved by the Owner on 2026-11-22 and 2026-11-23.

## Changed or replaced

| Item | Emergency branch | Merged | Why |
|---|---|---|---|
| 12.13 Midterm advisory placement | A full-width bar between the Grade Computation class picker and the tabs | A `Midterm advisory ▾` menu next to Submit grades; its first line is the status; the bar keeps only submission states | Owner: the bar was "awkward and cluttering"; picked option C of three |

## Owner rulings

- The emergency branch is the Owner's own work; its spec edits are already approved (no Needs-your-OK on them).
- F4: move the Midterm advisory out of its own bar (2026-11-23); option C chosen over A (button) and B (button plus a status line in the card). The general rule went to the `ui-fix-demo` references: a status that stays on screen for most of the term goes into its toolbar button.
- Kept as built and left for 12.14: the Face Enrolments tab style (white section tab bar), the taller Grade Weights title on phones.
- Rollout note: on production, current-term classes that are not yet submitted stop showing Final grades and Retention Status until Faculty submit; Midterm Advisory shows only for classes whose advisory was already emailed (073 backfill) or is published.

## How it was checked

- Emergency branch as received: `npx tsc -b`, 362/362 unit tests and 364/364 mocked browser tests.
- Review demo on real screenshots: base with its own backend on port 8081 against the branch on 8080, with migrations 072 and 073 applied to the dev database and one real revocation request created there; design review passed.
- Option C: type check, 362/362 unit tests, the mocked `grade-release-gates.spec.ts` (4/4), Stage 2 screenshots on 11 widths and dark mode, design review passed. `e2e/live/grade-submission.spec.ts` was updated to the menu.
- `scripts/check.ps1` and `scripts/check-postgres.ps1` run on the merged commit before `lighthal9-responsive` is fast-forwarded.
- Not checked: the amber "scores changed" state on screen (covered by the mocked spec), real phones.

## Demo links

- [Emergency branch review](https://claude.ai/artifact/NK7QzUvmQTEeYbB4QPdqHi) (Before/After of 9.29, 12.9, 12.12, 12.13)
- [Midterm advisory placement](https://claude.ai/artifact/EYdUGKXvXKYJAHSFWQLnw9) (option C as built)
