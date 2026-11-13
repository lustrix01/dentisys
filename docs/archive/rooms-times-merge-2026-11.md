# Rooms and session times audit, November 2026

Branch `lighthal9-rooms-and-times`, audited against `lighthal9-responsive` (99c7e2b, the build live on prod and under expert evaluation on 2026-11-06). The Owner approved the result on 2026-11-05. It stays on its own branch and is merged into `lighthal9-responsive` only when the Owner gives the signal.

## Taken as is

- Session room dropdown: the Start/Edit Session pop-up (Faculty and Secretary) picks the room from the grouped list, with Other / Custom Room (aa74b22).
- Retired-room warning on classes and session pop-ups, and the class room dropdown filled from the Dean's list (9a04e6b).

## Changed in the audit

| Id | Area | Problem found | Fix |
|---|---|---|---|
| F1 | Secretary requests panel (55f8555) | "Reject all" on 2+ requests failed: the server rejects one request at a time. | The panel rejects them one by one and shows "Rejected N requests." On a failure it stops, shows the error and reloads the list. No server change. |
| F2 | Overnight sessions (a4e75d6) | After midnight the Faculty page moved to the new day, so the roll call and manual marks missed the still-running session dated the day before. | While a session dated yesterday is still running, the Faculty Attendance page works on that date until the Faculty picks another one. |
| F3 | Dean Rooms (9a04e6b) | After a rename, sessions that already ran keep the old name, so a retired room looked unused and could be deleted. | Migration 056 adds `rooms.used_before_rename`. A room used before a rename can only stay retired ("Used under an older name"). |
| F4 | Student attendance (a4e75d6) | Yesterday's overnight session disappeared from the Student's list after the Late cutoff. | It stays under Today while the server still reports it as running. |
| F6 | Wording | The "Add next school year" button opened a dialog titled "Copy to next school year". The rename confirm said "0 classes and 0 scheduled sessions" when only class meetings used the room. | The dialog title is "Add next school year". The rename confirm names classes, class meetings and scheduled sessions (zero parts left out) and adds "Sessions that already ran keep the old name." A rename that changes nothing does not ask. |

## Owner rulings

- 2026-11-05: fix F1–F4 and F6 before merging; approve the merged result.
- Do not merge into `lighthal9-responsive` and do not deploy until the Owner's signal (prod is under expert evaluation).
- Backlog (not fixed): F5, two sessions of one class could open at once around midnight in a narrow timing window. Open questions: N1, `spec.md` ATT-001 still says the class end time "must be on the session day" next to the overnight amendment (wording fix needs Owner approval); N2, renaming a room also renames it on classes from past, view-only school years; N3, a typo can produce an almost-24-hour session that only shows a warning (within the amendment).

## How it was checked

- An independent read-only review of all 6 commits (38 files) found the defects above and no regressions in roles, routes, the booking-conflict wording or the geofence default.
- `scripts/check.ps1` and `scripts/check-postgres.ps1` passed on the fixed tree. New tests:
  - Reject all on a group of 2;
  - after-midnight Faculty date and manual mark;
  - the Student's overnight session after the Late cutoff;
  - the rename wording;
  - a room used before a rename cannot be deleted (database test).
- Real-app screenshots of the three versions on phone and desktop.

## Demo links

- [Rooms & Times Merge Comparison](https://claude.ai/artifact/DpezoFnRBF3oa9YGMu2ZQ3): today | branch | merged with fixes.
- [Review Hub](https://claude.ai/artifact/CXKXPAz5hiYra8z56BbWWb): the Before/After demos the Owner approved for each feature.

## Follow-up: room categories, overlaps and requests tab (2026-11-06)

Owner review of this branch led to new decisions, grilled with `/grill-me` and recorded in `spec.md` (commits 76092ce, a7fc2b1, c4817fc; ROOM-001, CLS-001, CLS-002, ATT-001, ATT-006).

- Rooms: categories are their own Dean list; starting rooms are CDM-1..3 in Lecture/Laboratory (migration 057); "Rooms | Retired" tabs like Classes; messages use the shared pop-up.
- Rename reaches current and future school years only and notifies each affected Faculty. Retire notifies them; a retired room cannot be picked or typed, and edit forms that still hold it cannot be saved. A retired room can be deleted once no class whose term has not ended, and no session not yet opened, uses it.
- Sessions: at most 12 hours, a room is required, and overlaps with another class's session (same room or same Faculty) or regular schedule show one "Book anyway" pop-up, with a bell notice to the other Faculty and an audit entry. F5 fixed: a scheduled session does not open while the same class still has one running.
- Class schedules clash only within the same semester; a booked session in the new slot shows the pop-up. Faculty cannot create a class in an ended term.
- Secretary requests: own tab in Attendance Monitoring with filters, Select all shown, and a confirm for approving several.

Checked: `scripts/check.ps1` (280 mocked UI tests) and `scripts/check-postgres.ps1` (database suite incl. new overlap, rooms and 12-hour tests; 15 live E2E) passed.

- [Rooms & Sessions Demo](https://claude.ai/artifact/4ANX88m56ebsHVNPvRPtPa): the approved clickable proposal (Today | Earlier proposal | Proposal now).
- [Rooms & Sessions Review](https://claude.ai/artifact/EaoxbUwB4Sj1XSZPegZCD1): real-app screenshots, light and dark, desktop and phone.
