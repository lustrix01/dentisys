# Owhie's responsive workflow merge, November 2026

Merge of `origin/owhie-responsive` (`d307980`, 11 commits, based on our old `lighthal9-responsive` at `99c7e2b`) into our follow-up line `lighthal9-responsive-tab-followup` (`747b56a`).

The Owner approved the merge on 2026-11-10 with the ruling: keep the colleague's functional changes; if a change breaks functionality, fix it; where our change is a better application of the same change, keep ours. The three-way review compared our branch, `owhie-responsive` and the merged tree.

## Taken as-is

- Our shared Tabs, flat list toolbars, filter rules, casing, warning tones, Dean-managed rooms and overnight-session behavior.
- The colleague's landing refresh, phone login, 12-hour time display, session-date alignment, lecture-only combined draft, BU-only email policy, sign-in limit and Midterm/Remedial notice emails.

## Changed or replaced

| Item | Their change | Merge |
|---|---|---|
| Create Class room selector | Hardcoded DM1 / DM2 / TBA and removed the custom room. | Not taken. Our Dean-managed room list, retired-room warning and custom place remain. |
| Email Management tabs | Five button tabs in a new grid. | Five destinations in our shared `Tabs` component, with the notice content retained. |
| BU-only email | Blocks non-BU addresses; spec retires multi-domain. | Kept. Inline warnings, server checks, README/env/VPS docs and backend tests now agree. |
| Public landing | New one-page landing. | Kept. The sample matrix claiming Attendance 10% was corrected to Term Exam 50%, Quiz 20%, Outputs 20%, Participation 10%. |
| Time display | 12-hour, no leading zero. | Kept; our overnight next-day labels use the same format. |
| Start Session date | Snaps to the selected meeting's weekday. | Kept with our room and overnight controls. |
| Lecture-only combined draft | Editable Lecture-only draft; attendance is not graded. | Kept with our Grade Weights tabs and casing. |
| Sign-in limit | 5 failed attempts per email in 15 minutes; Retry-After. | Kept; backend config/google/validation tests pass. A dedicated rate-limit test remains a follow-up. |
| Mobile notice tables | The new notice tables scrolled sideways on phones. | Fixed to stacked phone blocks; no sideways page scroll. |
| Validation wording | Backend and client repeated the field label. | Fixed: the client skips the extra prefix when the message already starts with it. |
| Lint and domain docs | Five lint rules off; docs still multi-domain. | Fixed: lint rules restored; docs describe the BU-only policy. |
| Roster sample CSV | Removed the sample download. | Restored. |

## Owner rulings

- Keep the colleague's functional changes; they are not regressions.
- Keep our better application where the same change already exists: shared Tabs, flat toolbars, filter rules, casing, Dean-managed rooms and overnight sessions.
- Replace the hardcoded room selector with our Dean-managed room list (ROOM-001).
- Keep the BU-only email policy, sign-in limit, lecture-only draft and Midterm/Remedial notice emails (their spec amendments of 2026-11-09/10).
- Three-way review approved on 2026-11-10.

## How it was checked

- Merged tree: `npx tsc -b` passes.
- Frontend unit tests: 223 of 223 pass.
- Mocked UI suite: 281 of 281 pass.
- Backend config, Google and validation tests pass.
- `git diff --check` clean.
- Three-way page from real screenshots: our branch, `owhie-responsive` and the merged tree.
- `check.ps1` passes: frontend build, 223 unit tests, backend tests, documentation contract and 281 mocked UI tests.
- `check-postgres.ps1` passes: disposable PostgreSQL integration, migrations, PHP checks and live E2E (15 passed; 4 demo-smoke cases skipped locally).
- The demo deployment follows this report; the tested SHA and demo result are added to the handoff.

## Demo

The demo deployment is performed from the merge commit after the gates. The tested SHA and demo result are reported in the merge handoff; production is untouched until the Owner promotes.
