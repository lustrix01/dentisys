# Manual browser comparison

The previews run locally through Docker with independent new databases and the
same fictional demo seed. Existing development and integration data is untouched.
The source preview is a frozen archive of `lumbang_final` commit `80e8563`.
The destination preview reads the current `lighthal7` files, including
the Owner-approved Faculty midterm wording correction.

## Open the two windows

| Window | Version | Sign-in address |
| --- | --- | --- |
| Left | Colleague: lumbang_final | http://localhost:15373/login |
| Right | Current: lighthal7 | http://127.0.0.1:15473/login |

Use these exact hostnames: cookies are shared across ports on a hostname, so
`localhost` on the left and `127.0.0.1` on the right keep both logins independent.
Ports **15173** (older integration test stack) and **5173** (development stack)
are different environments with different data; they are not this branch pair.
Open separate browser windows and snap them left/right with Windows + Left Arrow
and Windows + Right Arrow. Use the same window size, zoom and theme in both.

These are local-only fictional demo passwords from the repository's demo seed.

| Role | Email | Password |
| --- | --- | --- |
| Student in Faculty's CLINIC-4A | markanthony.hernandez@bicol-u.edu.ph | Student123! |
| Faculty of CLINIC-4A and CLINIC-4B | faculty@bicol-u.edu.ph | Faculty123! |
| Secretary/Student of CLINIC-4B | secretary@bicol-u.edu.ph | Secretary123! |

## Start with Student Dashboard

Sign into both windows with the Student account above. Open `/student/dashboard`
on both. Compare the summary cards and course table. `lighthal7` preserves Overall
GWA and Score %; the colleague version removes them. Compare with identical
Student identity and initial data before making any edits.

## Continue through the same routes

Append these paths to each window's base address, or use its navigation.

| Order | Account | Where to go in both windows | What to compare |
| --- | --- | --- | --- |
| 1 | Student | `/student/dashboard` | GWA, Score %, null/pending values and grade link. |
| 2 | Student | `/student/classes` | Current/Archived cards, class metadata, schedules, grade, score, clinical hours and retention details. |
| 3 | Student | `/student/retention` | Active Courses, Remedial Exams, Midterm Advisory and Past Records; current versus historical work, original grades, completed attempts and cost recovery. |
| 4 | Student | My Profile or `/student/profile` | Source redirects to Secretary-only profile; `lighthal7` opens Student profile. |
| 5 | Faculty | `/retention`, then Midterm tab | Select the same year/class. Compare risk filter, unlock/computation wording, completion and incomplete states. All Classes aggregate unlock is disabled on `lighthal7`. |
| 6 | Faculty | `/attendance` | Choose the same course, class, date and session; open Override. Compare blank correction reason versus reused reason, optional initial reason and unchanged-status behavior. |
| 7 | Secretary | `/secretary/attendance` | Exact session selection, missing attendance rows, History > View roll call and consolidated Override. |
| 8 | Secretary | Secretary/Student switch | Dashboard destinations, same identity, Student academic navigation and return to Secretary. Repeat with narrow windows if desired. |
| 9 | Secretary | `/secretary/override` with matching valid query parameters | `lighthal7` preserves `date`, `sessionId`/`session`, and `student` context through the redirect. |

Sign out in both windows before changing roles. Start with read-only observation;
if you make test edits, perform the same operation in both databases to keep the
comparison useful. Each preview owns its data, so changes never propagate to the
other preview. Some regression edge cases require deliberately prepared data
(for example, Sunday meetings, pending manual Warning, completed cost recovery,
and multiple same-day attendance sessions); the seed does not prove every case.
We can prepare a specific case after agreeing on the desired comparison.

Record a difference with the role, route/tab, selected class/date/session, both
observed outcomes and the behavior you prefer. A visible source difference does
not automatically authorize transferring its business behavior.

## Local setup record

- Source Compose project: `dentisys-compare-lumbang-20261003`.
- Destination Compose project: `dentisys-compare-lighthal7-20261003`.
- Backend ports: source 18280, destination 18380.
- Mailpit ports: source 18225, destination 18325.
- Local ignored source archive/Compose overrides:
  `_maintenance/branch-comparison-20261003/`.
- Start log: `C:/Users/decha/AppData/Local/Temp/dentisys-manual-comparison-start.log`.
- No volume deletion or automatic reset is part of this setup.

See [full code comparison](branch-comparison-2026-10-03.md) and
[handoff](HANDOFF_2026-10-03.md) for approved dispositions and validation evidence.
