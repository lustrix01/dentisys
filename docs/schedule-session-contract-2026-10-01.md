# Class meetings and attendance scheduling contract

## Class meetings

Class create/update accepts an optional `meetings` list. Each item contains:
`component` (`Lecture` or `Laboratory`), `day` (`Mon` through `Sun`),
`room` (1–100 characters), `startTime` and `endTime` (`HH:MM`).
The end must follow the start; meetings within a class cannot overlap.
Existing instructor and room conflicts are checked across active classes in
the current configured school year, including every individual meeting.

Example: Lecture/Mon/Room 101/08:00/10:00 and
Lecture/Tue/Room 101/15:00/17:00. The class GET response returns those meetings
without truncation. Existing room compatibility fields remain available.

Migration 043 adds atomic meeting storage and an explicit recorded flag.
Legacy strings remain verbatim in their original columns. Only complete,
recognizable room/day/time expressions are interpreted for compatibility;
unknown strings are retained, never guessed. Authorized updates write the
meeting list transactionally and include it in before/after audit evidence.
Legacy reads also return the original text verbatim. Metadata-only form edits
omit schedule fields, and two meetings of the same component/weekday remain
separate editable rows.
Removing every recorded meeting retains room labels and stored legacy evidence
without displaying the removed legacy times as the current schedule.

## Attendance sessions

Both existing creation endpoints accept `sessionDate` as a Manila calendar
date. Omission defaults to today. Invalid/past dates return 422. Future
sessions require opening/Present/Late times together. Opening must precede
Present cutoff, which must precede Late cutoff. Class end remains required
and at or after Late cutoff. A passed class end is rejected.

Future opening produces `scheduled`; an already reached opening produces
`active`. The shared lifecycle opens due sessions and ends overdue sessions
on authoritative reads/use. The management pages refresh from the server.
No background worker or browser clock decides eligibility. If nobody reads
or uses a session until after its end, it resolves directly to ended/Absent.

Under the class-section lock, both roles check the same booking interval,
from opening to class end. Strict interval intersection returns 409, naming
the existing date, times, creator role and display name. Back-to-back
intervals are allowed. Only scheduled and active bookings reserve a period;
ending or revoking a session releases it. Legacy sessions without timing
conservatively reserve the day while active.

Multiple sessions on one date keep distinct attendance results. An old
unlinked manual day record retains its existing compatibility behavior.
Excused requests and live Secretary counts are scoped to their session. The
selected session's own attendance takes precedence over an unlinked legacy
day result; session views retain that fallback without counting another
session's result. Delayed polls cannot overwrite completed session actions.
The active uniqueness guard is per class/date, so a legacy active session without
an end time cannot prevent another date's queued session from opening.
Scheduled sessions accept no biometric or manual attendance before opening.
Both roles may revoke a scheduled session; revocation preserves history.
Faculty worksheet reads can inspect future queues, while future attendance
writes remain prohibited. Historical school-year classes remain view-only.

## Input and count scope

The Faculty retention sidebar requests the current year explicitly and counts
distinct students. The monitoring page labels distinct students separately
from course enrollments and pending remedial exams, shows its school-year
scope and offers a filter reset. It does not infer new retention decisions.

Person-name inputs filter digits and unsupported symbols during entry and
paste. Prefix/suffix allow commas; name parts preserve letters, combining
marks, spaces, apostrophes, hyphens and periods. IME input is filtered after
composition completes. Existing server validation remains authoritative.
Course codes/names, rooms, identifiers, email, passwords, notes and search
remain unrestricted by the name filter.
