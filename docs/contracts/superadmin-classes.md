# Superadmin Classes: live records and Change Faculty

Owner choice (2026-11-19): "View + change Faculty". Settled with the Owner's `/grill-me` on 2026-11-19 (decisions D1-D19 below).

## Rule

The Superadmin sees every Faculty member's class sections and rosters, read-only, and may move an active class section of the current school year to another active Faculty member. Creating, editing, archiving and restoring stay with Faculty (CLS-001, CLS-003).

## Per role

| Role | Classes page | Change Faculty |
|---|---|---|
| Superadmin | All class sections, all school years, Active and Archived | Yes, current-year active classes only |
| Dean, Faculty, Secretary, Student | No access (403) | No |
| Faculty who lose a class | It leaves their Classes & Rosters, grades, attendance and reports at once | — |
| Faculty who gain a class | It appears with everything in it, editable like their own | — |

## Data

No migration. The owner of a class is `class_sections.instructor_user_id`; Change Faculty updates that one column. Everything else stays on the class: students, assessments, scores, grades, attendance records, scheduled and auto sessions, remedials, retention entries, Class Secretary, join code and pending join requests, room and schedule. Audit rows keep their real actor.

## API (Superadmin only; others 403, no token 401)

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/api/admin/classes` | `view=active\|archived` (default active), `schoolYear`, `semester=1ST\|2ND\|Summer`, `courseId`, `facultyId`, `q` (course code, title, section, Faculty name), `page` (50 per page). Unknown value: 422 | `{classes:[ClassRow], total, page, pageSize, counts:{active, archived}}` |
| GET | `/api/admin/classes/filters` | none | `{schoolYears:[...], currentSchoolYear, courses:[{courseId, courseCode, title}], faculty:[{userId, name, status}]}`; faculty includes deactivated members, shown "(deactivated)" (D15) |
| GET | `/api/admin/classes/detail` | `csId` | `{class: ClassRow, roster:[{studentNo, name, email, yearLevel, status}]}` |
| POST | `/api/admin/classes/change-faculty` | `{csId, toUserId, reason}` | `{status:"ok", message, class: ClassRow}` |

ClassRow: `{csId, courseCode, courseTitle, section, schoolYear, semester, yearLevel, faculty:{userId, name}, schedule:[{day, start, end}], rooms:{lecture, laboratory}, studentCount, secretary:{name}|null, archiveReason:"finished"|"cancelled"|"mistake"|"completed"|null, archivedAt, current:boolean, canChangeFaculty:boolean}`.

Sort: current school year first, then course code, then section. Archived view shows Completed apart from Cancelled and Created by mistake, as on Faculty Classes & Rosters.

Example:

```json
POST /api/admin/classes/change-faculty
{"csId": 41, "toUserId": 77, "reason": "Dr. Reyes is on leave for the rest of the semester."}
→ 200 {"status":"ok","message":"DENT 101 (CDM-1A) now belongs to Dr. Ana Cruz.","class":{...}}
```

## Change Faculty refusals

| Code | HTTP | When | Message |
|---|---|---|---|
| `validation` | 422 | missing `csId`, `toUserId` or a reason under 5 characters | "Enter a reason." |
| `class_not_found` | 404 | no such class | "Class not found." |
| `class_not_current` | 409 | past school year or archived | "Past and archived classes are view-only." |
| `same_faculty` | 409 | `toUserId` already teaches it | "This class already belongs to that Faculty member." |
| `faculty_not_eligible` | 409 | target is not an active Faculty account (deactivated, invited, Dean, Student, Superadmin) | "Choose an active Faculty member." |
| `session_open` | 409 | an attendance session for the class is open | "End the open attendance session first, or wait until it ends at 10:00 AM." (the session's end time; it ends on its own, `attendance_session_auto_ended`) |

Runs in one transaction with `FOR UPDATE` on the class row, like `faculty_class_archive_change`.

## Notices and audit

- In-app notification (`notification_create_idempotent`, type `class_assignment`) **and** email to both Faculty members (template like `email_dean_transferred_html`, recorded in Email History). A failed email does not undo the change; it shows as failed in Email History (D1, D11).
  - Previous Faculty member, subject "Class moved": "DENT 101 (CDM-1A) was moved to Dr. Ana Cruz by the Superadmin. Reason: <reason>. It no longer appears in your classes."
  - New Faculty member, subject "Class assigned to you": "DENT 101 (CDM-1A) is now yours. Its students, grades, attendance and sessions came with it. Reason: <reason>." (D12)
- Class Secretary, if any: in-app notice "Your class DENT 101 (CDM-1A) now has Dr. Ana Cruz as its Faculty member." Students: nothing (D14).
- Audit `class_faculty_changed`, actor Superadmin, scope the class, reason, before `{instructor_user_id, name}` and after the same. Shown in the Superadmin Audit Trail under class work.

## Screen (copies the current preview page, which already follows "Page patterns")

| Part | Copies | Change |
|---|---|---|
| Notice banner | — | Removed (no sample data) |
| Count line, Active/Archived tab switch, search, filters, Clear filters | `pages/admin/Classes.tsx` (today) | Real counts; filters School Year, Semester, Course, Faculty come from `/filters` |
| Class cards | same file `ClassCard` | Real data; "N students"; Edit and Archive buttons removed; Change Faculty icon button (`UserRoundCog`) only on current active classes, hidden (not disabled) elsewhere (D17); Restore removed |
| Class Details dialog | same file | Real roster; Class Secretary row added; "Preview roster only" line removed |
| Change Faculty dialog | the People & Accounts deactivate dialog (reason field) | Shows class, current Faculty, a select of active Faculty, a reason, and a note of what moves with the class |
| Empty, loading, error states | `docs/frontend.md` "Page patterns" | Standard ones |
| Paging | People & Accounts | 50 per page |

Create Class button and the Create/Edit/Archive/Restore dialogs are removed.

## Other places

- People & Accounts: in the deactivate refusal "Reassign or archive them first", each listed class links to Classes filtered to that Faculty member (D16).
- Faculty deactivation (SA21) is unchanged; after Change Faculty the block clears.

## Spec amendment (replaces `spec.md` line 1177; Owner OK 2026-11-19, D18)

> Owner decision (2026-11-19): The Superadmin's Classes screen lists every Faculty member's class sections (Active and Archived, all school years; Cancelled and Created-by-mistake apart from Completed) with their rosters, read-only. Its one action is Change Faculty: the Superadmin moves an active class section of the current school year, also during its term, to another active Faculty member (not the Dean), one class at a time and with a reason. It is refused while an attendance session for that class is open. The class keeps its students, grades, attendance, scheduled and automatic sessions, Class Secretary and join code. The new Faculty member gets full access, and the class leaves the previous Faculty member's classes and reports; their past actions stay in the audit log. Both Faculty members get an in-app notice and an email (a failed email does not undo the change), the Class Secretary gets an in-app notice, and the change is audited. Creating, editing, archiving and restoring stay with Faculty (CLS-001, CLS-003).

ADM-001's Superadmin list (line 1199) already names Classes; no change there.

## Tests

- `tests/backend`: Superadmin only on all four routes; filters and paging; archived view splits Completed; change-faculty success moves ownership (old Faculty 403 on the class, new Faculty 200), keeps students/scores/sessions/secretary, writes audit and three notifications (two Faculty, Secretary) and two email outbox rows; a failed email still commits; each refusal above; rollback if the audit write fails.
- `tests/database`: none (no migration).
- `e2e/` mocked: page lists, filters, details, Change Faculty dialog success and a refusal.
- `e2e/live/`: Superadmin changes a class's Faculty; the new Faculty opens its grades.
- Update `frontend/src/tests/superadminPagesContract.test.ts` from the preview to the live page.

## Docs in the same commit

`spec.md` (with OK), `docs/features.md`, `docs/contracts/superadmin.md` routes table, `docs/PRODUCT_BACKLOG.md` (Done line).

## Decisions (`/grill-me`, 2026-11-19, all as recommended)

| # | Decision |
|---|---|
| D1 | Email both Faculty members as well as the in-app notice. |
| D2 | The join code stays; the new Faculty member may press New code. |
| D3 | Change Faculty is allowed during a term in progress. |
| D4 | Superadmin only; the Dean has no Classes page. |
| D5 | Refused while a session is open; the message gives the session's end time. |
| D6 | Target: an active Faculty account only (not the Dean, invited, deactivated or the current owner). |
| D7 | Scheduled sessions and the auto-session setting stay with the class. |
| D8 | Reason required, at least 5 characters. |
| D9 | One class at a time; no bulk move. |
| D10 | Cancelled and Created-by-mistake classes show in Archived, apart from Completed. |
| D11 | A failed email does not undo the change. |
| D12 | Notice and email wording as in "Notices and audit". |
| D13 | The class leaves the previous Faculty member's classes and reports; their audit rows stay. |
| D14 | The Class Secretary gets an in-app notice; Students get nothing. |
| D15 | The Faculty filter lists deactivated members, marked "(deactivated)". |
| D16 | People & Accounts deactivate refusal links each class to Classes. |
| D17 | The Change Faculty button is hidden on past and archived classes. |
| D18 | Spec amendment text above approved. |
| D19 | The work is priority P1 above the backlog (`docs/PRODUCT_BACKLOG.md`). |
