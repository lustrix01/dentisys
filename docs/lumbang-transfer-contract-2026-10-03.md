# Colleague transfer contracts (2026-10-03)

These contracts preserve the existing specification and implement the Owner's
approved transfer sequence. The Owner approved the exact Student advisory
amendment in UI-003 on 2026-10-03; see `spec-amendments-2026-10-03.md`.
The Owner subsequently approved the exact enrollment-notification policy in
NTF-001, recorded in the same amendment file.

## Enrollment notifications

- Existing endpoints and request/response fields stay unchanged:
  `POST /api/faculty/students` and `POST /api/faculty/classes/enroll`.
- A new or reactivated enrollment may create a persisted `class_enrollment`
  notification for each active canonical linked Student/Secretary account.
  Match `students.student_account_user_id` to a Student/Secretary account, or
  `students.user_id` to a Secretary account. Do not infer identity from email.
- Preserve existing ownership/current-year validation, errors, audit and
  membership history. Enrollment, audit and notification commit atomically.
- Use entity type `class_section`, its class ID and the existing source key
  `class_enrollment:{classId}:{recipientUserId}`. Repeated enrollment/reactivation
  produces at most one notice per class/recipient; an already active enrollment
  remains a no-op. This key does not create a new reminder lifecycle.
- Example: enrolling linked active account 42 in class 9 creates one notice with
  key `class_enrollment:9:42`; repeating the request creates none. An unlinked
  account with matching email, or a disabled linked account, receives none.
- Newly registered roster Students have no activated linked account yet; their
  creation must succeed without fabricating a recipient or activation flow.
  Later account activation does not replay missed enrollment notices (NTF-001).
- An invalid later member of a batch rolls back earlier enrollment/notification
  changes. Existing 403/409/422 errors remain unchanged.

## Class metadata and navigation

- Add instructor display, distinct lecture/laboratory rooms, block, canonical
  `meetings`, `meetingsRecorded`, `isCurrent`, `isPast`, and configured current
  year to existing Student academic responses. Existing fields stay present.
- Meeting shape reuses the existing class contract: component, weekday, room,
  startTime and endTime. Sunday, repeated weekdays and differing rooms/times
  remain representable. Recorded empty meetings override legacy schedule text.
- Current/past classifications come from the server. Unknown/future enrollments
  must not be silently presented as past or current. An empty current list stays
  empty; API errors do not become prototype academic data.
- Preserve Student grade, percentage, clinical hours, retention guidance and
  Dashboard Overall GWA/percentage. Keep development prototypes clearly labelled
  and governed by their existing runtime provenance gate.
- BIO-010 Secretary Student mode exposes only their own academic surfaces under
  the same account. Ordinary Student profiles remain `/student/profile`;
  Secretary profiles remain `/secretary/profile`. Student mode opens Dashboard.

## Attendance and retention presentation

- Consolidated Secretary overrides preserve exact date/session/record targeting,
  missing-record rosters, correction reason limits (8-240; Excused requests use
  the existing 8-500 range), fresh reasons,
  unchanged-status guards and Faculty-only approval of Excused requests.
- Preserve the legacy override URL and applicable query selection. Same-day
  sessions must remain distinguishable in history, rosters and writes.
- Faculty initial attendance keeps optional reasons. Corrections require a new
  nonempty reason; unchanged statuses must not cause a correction mutation.
- Preserve baseline synchronous write guards, stale-read rejection, polling,
  refresh coordination and historical read-only rules.
- Watchlist unlocking targets one explicitly selected class and changes
  visibility only. Counts/filters use the approved server risk projection.
- Retention presentation preserves the final-grade 2.50 trigger, incomplete and
  empty states, original course grades, separate remedial attempts and distinct
  required/failed/passed cost-recovery outcomes. Completed/historical work stays
  separate from active current work.

## Approved Student advisory

- Add `midtermEvaluation` with `complete`, nullable `percentage`/`grade`,
  `isAtRisk` and nullable `risk` from the existing Faculty calculation/projection.
  Missing assessment data never becomes a fabricated computed grade.
- Risk contains the existing `level`, `period` and `assumedAssessments` fields.
  Current High/At Risk courses show an informational advisory; Low does not.
  Null risk is explicitly unavailable. Current-period projection may be useful
  while the full midterm grade remains incomplete.
- Retention responses add current-year `midtermAtRiskCount` and
  `hasMidtermWarning`. Historical/future courses do not affect the current count.
- No independent 80% threshold, stored-computed fallback or swallowed
  calculation error is introduced. No remedial stage or visibility rule changes.
