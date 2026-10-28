# User walkthrough, October 2026: changelog

A role-by-role walkthrough of the app (Dean and Faculty on desktop, Secretary and Student on phones), fixed in small approved batches on branch `lighthal9-responsive`. Everything below is pushed and runs on the demo site as `5403e4021bae`. Production is not promoted yet. The Owner runs `.\scripts\promote-prod.ps1 -Sha 5403e4021bae`, which also applies migration 052.

## What changed

| Commit | Batch | What the user sees now |
|---|---|---|
| `419ba94` | Dean | Attendance Reports count every record (the old cap of 500 showed 80% instead of the real 87%). The all-classes attendance export keeps every row (the old cap was 200). Invite and email-history times show Manila time (they were 8 hours early or raw). Active Faculty with no invitation record show "Active", not "Not invited". Students without a final grade show "No Grade Yet" in Dean reports, exports and the Dashboard. Academic Terms say "1st Semester", Add term opens on the next missing term, "Copy to next school year" and a plain delete question. The Google button is in English. |
| `f8e236f` | Faculty | `EMAIL_PROVIDER=mailpit` always delivers to Mailpit with no login and ignores `SMTP_*` (EML-001). The roster ⋮ menu is never cut off. Roster chips read Registered / Invite sent / Delivery failed / Not invited. Make or Remove Class Secretary is in the roster menu, and Email Management allows one Secretary choice per section. Assessment categories say Lecture/Laboratory. A new max score starts empty and asks above 500 points. Cells show "Incomplete" with a note naming categories that have no assessments. Attendance wording: "New Attendance Session", "View", Start hidden while live, "Mark" for first entries, and rows reload after marking. |
| `bd66aba` | Secretary | Roll call opens on the live session. Class cards show the section's real course title, term and rooms (placeholders removed). Roll-call rows stack on phones. Wording matches Faculty. An "Excuse requested" chip appears. The log names the student. |
| `6560c12` | Student | Student invitations last 7 days (was 1 day). The dashboard says "Welcome", shows a "Register your face to check in" card until enrolled, and "No grade yet". Retention shows the real course components. Wording: "1 Subject", "1st Semester", AM/PM times, "Today & upcoming sessions", "Start face capture". Face Registration has a compact step line on phones. The Google script loads in English. |
| `a1d6af7`, `6a69442` | Secretary requests | Every Secretary manual change (first mark, change, Excused) is a request that the section's Faculty approves (ATT-006, migration 052). The Secretary sees "<Status> requested", Cancel request, then Approved or Rejected. Faculty get a "Secretary requests" panel with bulk approve, reject with a note, history and badges. Approved records read "Secretary (approved by Faculty)" at the request time. Requests close by themselves when Faculty mark directly, the session is revoked or the student checks in by face. Notices are in-app only, no email. |
| `9d18dea` | Open items | Dean report cards show the teaching Faculty and a Finished chip. Faculty Invitations are stacked blocks on phones. One message per action, and form labels are linked to their fields. Plain wording in Settings, Reports and the audit, and the removed student is no longer named in the audit. Faculty grading setup steps read Weights, Assessments, Scores, with a recompute hint after saving scores. Room clashes show inline in AM/PM, with a plain term label and grouped room lines. Faculty get plain wording, a first-steps card and amber for a failed invite email. Long selects stop before the dropdown arrow on phones. Spec lines added: 7-day invitations (REG-001); students see grades only and exports are .xlsx in official layouts (GRD-002). |
| `5403e40` | Backlog | New entries 4.5 (Dean view of grade and attendance changes, D12), 4.6 (course catalog control, F14) and 4.7 (account deactivation, D5). They wait on the Owner's group. |

## Owner rulings (2026-10-28)

- Legacy active Faculty are shown as "Active".
- "No Grade Yet" shows until a final grade exists.
- Account deactivation goes to the backlog.
- Any Faculty may look up a student by number. This is acceptable.
- The Secretary action lives in the roster menu. The tab stays.
- Roll calls and Faculty Invitations stack as rows on phones. These are exceptions to the "tables scroll sideways" rule.
- Every Secretary manual mark needs Faculty approval.
- Students see grades only.
- Student invitations last 7 days.
- The demo site sends no emails.

## How it was checked

- A role-by-role walkthrough on the local stack, plus spot checks on the demo database.
- Device sweeps.
- Each batch was shown as a real-screenshot Before/After demo and approved before commit.
- `check.ps1` and `check-postgres.ps1` on every batch.
- After each deploy: live demo smoke tests (4/4), the audit chain check and read-only live API checks.

## Not verified

- Face enrolment and face check-in on a real phone. The review browser blocks the camera.
- Some states that need data changes.

## Lessons

- Mailpit mode must ignore `SMTP_*`. A test invite once leaked through Gmail before the fix.
- Run `check.ps1` and `check-postgres.ps1` in separate processes.
- Never stash files while a gate runs.
- `promote-prod` needs HEAD to equal the tested sha. Commit nothing after the tested commit until the Owner promotes.
- A release with migrations needs `demo-vps.ps1 migrate` before Watchtower rolls out code that needs them.
