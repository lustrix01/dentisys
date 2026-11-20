# Grade submission, deadlines and Dean approval (13.8)

Owner decisions 2026-11-20 (backlog 13.8), settled with the Owner's `/grill-me` on 2026-11-20 (decisions Q1-Q26 below). A critic review of the build plan (2026-11-20) added the implementation notes.

## Rule

A class stays editable until its Faculty submit the grades; submitting locks it, and after a 24-hour grace any change goes through one batch the Dean approves.

## Per role

| Role | What they do |
|---|---|
| Faculty | Submit grades per class (any time); Withdraw within 24 h; after that Request grade change, edit the draft, Send for Dean approval with one reason, Pull back or Discard while pending. |
| Dean | Grade Submissions page: Submissions tab and Change Requests tab; approves or rejects a whole batch (reject needs a reason). Teaches no class. |
| Superadmin | Sets the submission deadline on Academic Terms; sees Grade Submissions read-only in Superadmin mode (Q19). Approves nothing. |
| Class Secretary | Attendance change requests on a submitted class are refused; during a draft sees the submitted copy (Q20). |
| Student | No change: sees grades and attendance as submitted, never draft changes, no notice on approval (Q2, Q7). Join requests to a submitted class are refused (Q13). |

## States of a class

| State | Meaning | Faculty may |
|---|---|---|
| Not submitted | Never submitted, or withdrawn | Everything as today, also in a later school year (Q23) |
| Submitted, in grace | Within 24 h of the latest submission | Withdraw; decide Secretary requests pending from before the lock; nothing else |
| Submitted | Grace over, no open batch | Request grade change; remedial and cost recovery as today |
| Draft | Change request open, not sent | Edit scores, assessments and attendance records of existing sessions (Q24); Send, Discard. No grade weights, new sessions, auto-sessions, roster or join changes (Q12, Q13, Q24) |
| Pending | Sent, Dean has not decided | Pull back (to Draft), Discard |

Deadline status, computed on every read from the current deadline and the latest submission (Q3, Q4): **Not submitted**, **Late** (not submitted, deadline passed), **Submitted**, **Submitted late** (latest submission after the deadline). The deadline ends at the end of its date, Asia/Manila. API values: `deadlineStatus` is `not_submitted | late | submitted | submitted_late`; `status` is `not_submitted | submitted` (in grace or not; `graceUntil` tells).

## Rules

1. Submit is refused while an attendance session of the class is open (Q14). A confirmation lists students with missing scores and still allows submitting.
2. Each submission sets a fresh 24-hour grace. Withdraw needs no approval.
3. A submitted class (in grace or after) is view-only like an archived class. Past school year alone no longer makes a class view-only; an unsubmitted class stays active and Late into the next school year (Q23). Remedial and cost recovery stay recordable (existing exemption).
4. Grade weights (shared by a Faculty member's sections of one course and term) lock while any of those sections is submitted, in grace or after: "Grades for DENT 101 (A) are submitted; weights are locked." Withdrawing unlocks them (Q25). A draft never changes weights (Q24).
5. No session opens or is created for a submitted class or a class in Draft or Pending: auto-sessions are not created (Q11), and an already scheduled session does not open; it stays in the list and opens normally if Faculty withdraw before its time. Nothing is revoked (Q26).
6. At most one batch per class. Approval applies the changes, records old → new values and locks the class again with no new grace. Reject (reason required) and Discard restore the class to its submitted state.
7. A batch lists every student whose scores, attendance or grade changed, even when the grade is the same (Q16).
8. Archiving as Finished needs the grades submitted; archiving is refused while a Draft or Pending batch exists (Q15). Cancelled and Created by mistake may be archived any time. Restoring a Finished class keeps it submitted.
9. The automatic Completed archive at school-year end applies only to submitted classes.
10. Change Faculty (CLS-003, Superadmin) works on a submitted class; the new Faculty member inherits the submission and any open batch.
11. Remedials after an approved change: standing recomputes as today; recorded attempts are never deleted; a student who no longer needs a remedial but has attempts shows "Grade changed after remedial was recorded" to the Faculty on that row.
12. A draft never expires (Q21). The class card chip shows "Grade change draft".
13. Secretary attendance requests: on a submitted class refused with "Grades for this class are submitted. Ask your Faculty."; requests pending from before the lock can be decided by Faculty only during the grace.
14. Reasons (Send for Dean approval, Reject) need at least 8 characters, shown before the button is pressed (Q8).
15. Existing data: classes of past school years that are not archived count as submitted when 13.8 ships (submitted at their term end, no grace). Current-year classes start Not submitted (Q9).

## Draft mechanism (Q1, Q2, Q10, Q20, Q24)

- **Open:** Request grade change copies into `grade_change_batches.snapshot` the class's assessments, assessment scores, attendance records of its sessions (by `record_id`) and each enrollment's published `final_percentage`, `final_gwa` and `grade_components_json`.
- **Edit:** Faculty edit the live rows through the existing screens and endpoints.
- **Draft grades:** while a batch is Draft or Pending, `faculty_save_computed_grade` (the only writer of published grades) finds the enrollment's open batch and writes the result into `grade_change_batches.draft_results` instead of `enrollments`. It sends no student retention notice and writes no per-change grade audit rows. Faculty screens that read grades (`COALESCE(egb.*, e.*)` in `FacultyController.php`, about 7 places, plus `faculty_grade_moves` and remedial eligibility) overlay the draft result, so Faculty see their draft.
- **What others read during a draft:** Students, the Class Secretary and the Dean keep the published grades. Every non-Faculty read of raw data uses the snapshot while a batch is open:
  - the student Midterm evaluation (`faculty_watchlist_midterm` via `StudentAcademicController`), which reads raw scores;
  - student attendance summaries and check-in history (`StudentAcademicController`, `StudentBiometricController`);
  - the Secretary attendance list (`SecretaryController`);
  - the Dean dashboard attendance and Dean attendance logs (`AdminController`).
- **Approve:** write the draft results into `enrollments` (percentage, GWA and components only; retention state recomputed from the result and any recorded remedial attempts, as `retention_effective_state` does), store old → new values in `changes`, clear the snapshot. The `enrollments` trigger refreshes `enrollment_grade_breakdowns`.
- **Reject / Discard:** restore in dependency order by updating rows in place: attendance records by `record_id`, assessments by their original `assessment_id`; rows created in the draft are deleted after their dependents (attendance corrections and Excused requests). Published grades are not touched (they never changed). Remedial and retention fields are never part of the snapshot, so remedials recorded during the draft survive.

## Implementation notes (critic review, 2026-11-20)

- **The lock check** `academic_class_section_is_past()` becomes "archived, or submitted with no open draft"; `academic_view_only_message()` gains "Grades for this class are submitted." Mutation paths that check the school year or archive state directly, not through it, get the same check: roster add and remove and class edit (`FacultyController`), Student invitations (`StudentAuthController`), joins (`class_join.php`, `ClassJoinController`), the weight save (rule 4), `auto_sessions_top_up_class` and `attendance_sessions_open_due` (rule 5). The roster and class-edit paths also stop refusing an unsubmitted past-year class (Q23).
- **Places that show the year as Completed or past** switch to "submitted and past year": the Superadmin Classes `completed` label, the Faculty class list `isArchived` and `classVisible`, the student `isPast`.
- **The Faculty decision on a Secretary request** gets an explicit grace exemption (rule 13), since the lock otherwise refuses it.
- **`bin/recompute-current-grades.php`** skips classes with an open batch.
- **Archive:** the Finished check (rule 8) goes into the archive handler; the backfill (rule 15) skips classes that already have an archive reason.

## Data (migration `071_grade_submission.sql`, additive)

- `academic_terms.grade_deadline date NULL` — empty means term end + 14 days. Must be on or after the term end (Q17).
- `class_sections.grades_submitted_at timestamptz NULL`, `grades_submitted_by integer NULL REFERENCES user_accounts`, `grades_grace_until timestamptz NULL`.
- `grade_change_batches`: `batch_id`, `cs_id`, `faculty_user_id`, `status` (`draft|pending|approved|rejected|discarded`), `reason`, `created_at`, `sent_at`, `decided_at`, `decided_by_user_id`, `decision_reason`, `snapshot jsonb`, `draft_results jsonb`, `changes jsonb`. A partial unique index allows one `draft|pending` batch per class.
- Backfill: rule 15.

## API

Faculty (own classes only; others 403):

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/api/faculty/classes/grade-submission` | `csId` | `{status, deadlineStatus, deadline, submittedAt, graceUntil, missing:[{name, studentNumber, missingCount}], batch:{batchId, status, reason, sentAt, decisionReason}\|null}` |
| POST | `/api/faculty/classes/grade-submission` | `{csId}` | same object |
| POST | `/api/faculty/classes/grade-submission/withdraw` | `{csId}` | same object |
| POST | `/api/faculty/classes/grade-change` | `{csId}` | same object (batch in `draft`) |
| POST | `/api/faculty/classes/grade-change/send` | `{csId, reason}` | same object (batch `pending`) |
| POST | `/api/faculty/classes/grade-change/pull-back` | `{csId}` | same object (batch `draft`) |
| POST | `/api/faculty/classes/grade-change/discard` | `{csId}` | same object (no batch) |

Dean (decides) and Superadmin (read-only GETs; POSTs 403):

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/api/admin/grade-submissions` | `termId` (default current term), `courseId`, `status` | `{classes:[{csId, courseCode, section, faculty, deadline, deadlineStatus, submittedAt}], lateFromEarlierTerms}` |
| GET | `/api/admin/grade-change-requests` | `state=pending\|decided` | `{requests:[{batchId, csId, courseCode, section, faculty, reason, sentAt, status, studentCount}], pendingCount}` |
| GET | `/api/admin/grade-change-requests/detail` | `batchId` | `{request, students:[{name, studentNumber, oldGrade, newGrade, changes:[{kind:"score"\|"attendance"\|"assessment", label, old, new}]}]}` |
| POST | `/api/admin/grade-change-requests/approve` | `{batchId}` | `{status:"ok", message}` |
| POST | `/api/admin/grade-change-requests/reject` | `{batchId, reason}` | `{status:"ok", message}` |

The deadline is one more field, `gradeDeadline`, on the existing `/api/admin/academic-terms` save.

The Faculty class list (`GET /api/faculty/classes`) adds `gradesSubmitted`, `gradeDeadlineStatus` (as above) and `gradeChangeStatus` (`draft | pending | null`) to each class, for the class card chip.

Errors (409 unless stated):
- "End the open attendance session first."
- "Grades are already submitted."
- "The withdraw period ended at <date, time>."
- "Grades for this class are not submitted."
- "Grades for this class are submitted." (any locked mutation)
- "Grades for <course> (<section>) are submitted; weights are locked."
- "This class already has an open grade change."
- "Send or discard the grade change first." (archive)
- "This request was pulled back by the Faculty." / "Only a pending request can be decided."
- 422: "Give a reason of at least 8 characters." · "The deadline must be on or after the term end (<date>)."

Example:

```json
POST /api/faculty/classes/grade-change/send
{"csId": 41, "reason": "Late lab practical scores for three students."}
→ 200 {"status":"submitted","deadlineStatus":"submitted","batch":{"batchId":7,"status":"pending","reason":"Late lab practical scores for three students.","sentAt":"2026-12-02T09:14:00+08:00"}, ...}
```

## Notifications

- Dean: in-app when a batch arrives (no email).
- Faculty: in-app and email on approval or rejection, with the Dean's reason (a failed email does not undo the decision).
- Students: none (Q7).

## Audit

`grades_submitted`, `grades_withdrawn`, `grade_change_sent`, `grade_change_pulled_back`, `grade_change_discarded`, `grade_change_approved`, `grade_change_rejected` (with reason), `grade_deadline_changed`; area Grading. Draft edits are audited as usual (scores, assessments, attendance; Owner 2026-11-21), except the automatic grade recompute rows; the decided batch also keeps old → new values.

## Screens (parts confirmed in the ui-fix-demo Stage 1 demo, approved 2026-11-21: https://claude.ai/artifact/M9dwYpjY5NLAXW6gS4hUX3)

- Faculty class: status chip on the class card (Q6: no reminders); banner per state (Q5, Q22): in grace "Submitted. You can withdraw until <date, time>." + Withdraw; submitted "Grades submitted on <date>." + Request grade change; draft "Grade change draft." + Send for Dean approval / Discard; pending "Sent for Dean approval on <date>." + Pull back; rejected "Grade change rejected: <reason>." Submit confirmation copies the 13.7 confirmation dialog. Grade Weights shows the weights-locked message (rule 4).
- Dean: sidebar item "Grade Submissions" with a pending count badge; tabs, filter bar and table copy the Attendance Monitoring Secretary requests tab; batch rows expand to their changes.
- Superadmin: same page in Superadmin mode, without Approve / Reject.

## Spec amendments

Approved by the Owner on 2026-11-20 and applied to `spec.md`:

**New, after GRD-003:**

> ## GRD-004 - Grade submission and Dean approval
> **Status: APPROVED**
>
> Owner decision (2026-11-20): Faculty submit a class's grades once, at any time, after a confirmation that lists students with missing scores; submitting is refused while an attendance session is open. For 24 hours after each submission Faculty may withdraw it without approval. A submitted class is view-only like an archived class (CLS-003): sessions, attendance, assessments, scores and the roster are locked, no session opens or is created for it, and the grade weights of that Faculty member's course and term are locked for all of its sections; remedial and cost recovery results stay recordable. Each term has a submission deadline (ACA-002); a class not submitted by the end of that date is Late, and a submission after it is Submitted late; nothing locks automatically.
>
> After the 24 hours, Faculty change grades only through a grade change: the class opens as a draft that Students, Class Secretaries, reports and the Dean do not see; Faculty may change scores, assessments and attendance records of existing sessions, but not grade weights, sessions or the roster; then they send it for Dean approval with one reason. A class has at most one grade change at a time; until the Dean decides, Faculty may pull it back to draft or discard it. The Dean approves or rejects the whole grade change; rejecting needs a reason and discards it; approving applies it and locks the class again with no new withdraw period. The Dean is notified in-app when a grade change arrives; the Faculty member is notified in-app and by email of the decision and its reason. Submitting, withdrawing, sending, pulling back, discarding, approving, rejecting and changing a deadline are audited; the decided grade change keeps each changed student's old and new values.
>
> The Dean's Grade Submissions page lists the term's classes with their submission status (Cancelled and Created-by-mistake classes excluded), a count of Late classes from earlier terms, and the pending and decided grade changes. The Superadmin sees it read-only. Classes of past school years count as submitted from the release of 13.8. Details: `docs/contracts/grade-submission.md`.

**CLS-002**, replace "Past-school-year classes are view-only:" with:

> Past-school-year classes whose grades are submitted (GRD-004) are view-only; a class whose grades are not submitted stays editable until they are:

**CLS-003**, replace "Past-school-year class sections are archived automatically as Completed when the school year ends;" with:

> Past-school-year class sections whose grades are submitted (GRD-004) are archived automatically as Completed when the school year ends; an unsubmitted class section stays active until its grades are submitted;

and add after "A class section with a pending remedial may be archived only as Finished.":

> Archiving as Finished requires the grades to be submitted (GRD-004), and archiving is refused while a grade change is open. Restoring a class section archived as Finished keeps its grades submitted.

**ACA-002**, add after the first paragraph:

> Each term has a grade submission deadline (GRD-004), by default the end date plus 14 days; the Superadmin may set it to any date on or after the end date. Changing it is audited.

**ATT-006**, add after the Secretary request paragraph:

> Once a class's grades are submitted (GRD-004), a Secretary attendance request for it is refused; requests pending from before may be decided by Faculty only during the 24-hour withdraw period.

**ATT-008**, add:

> No auto-session is created, and no scheduled session opens, for a class whose grades are submitted or that has an open grade change (GRD-004).

**UI-005**, replace "For a past-school-year class or one archived as Finished," with:

> For a class whose grades are submitted (GRD-004) or one archived as Finished,
