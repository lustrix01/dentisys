# Secretary attendance requests

Status: agreed with the Owner in a /grill-me review on 2026-10-28; not built yet. Spec: ATT-006 Owner decision (2026-10-28).

## Rule

Every manual attendance change a Class Secretary makes is a request. Only the class section's assigned Faculty instructor approves or rejects it; other Faculty and the Dean do not. Until approved, the official record stays as it was. Face (biometric) check-ins need no approval. When the session ends, a student whose request is still pending is resolved to Absent like any unrecorded student; a later approval changes that record.

What becomes a request: first marks on unrecorded students, changes to manual records, changes to face check-in results, and Excused. Requests are allowed for live and ended sessions, never for scheduled or revoked ones (as today). Records Secretaries saved directly before this change stay as they are; nothing is sent for retroactive approval.

## Secretary

- Dialog title "Request Attendance Change"; submit button "Send for approval"; line "Your class Faculty must approve this before it counts."
- Reason: optional for a first mark (Present / Late / Absent on an unrecorded student); required for Excused and for changing an existing record.
- One pending request per student per session. The row keeps the official status and adds a chip "Present requested" (etc.); its action becomes "Cancel request". To change a pending request, cancel it and send a new one.
- After a decision the row shows "Approved" or "Rejected" (Faculty note on hover/tap) until the Secretary's next action on that student in that session. The Secretary gets an in-app notification for each decision; no email.
- Dashboard tile "Total overrides" becomes "Pending requests".

## Faculty

- The Excused requests panel becomes "Secretary requests": pending first; columns student, section, session date/code, requested status, current status (marked "face check-in" when the current record is biometric), reason, Secretary, sent at, plus the session's Present and Late cutoffs. Filter for Approved / Rejected history.
- Approve one or several at once; reject one at a time with an optional note.
- Faculty approve exactly the requested status; no automatic adjustment for cutoffs.
- Notice: count badge on Attendance Monitoring and the Faculty Dashboard, and an in-app notification; no email.
- Faculty roll call: a "Request pending" chip that opens the request in the panel; no Approve/Reject in the roll call.

## Students

Students see only the official record. They get no notification about Secretary requests.

## Approval effects

- Approving creates the record if none exists, or changes the existing one. Check-in time = when the Secretary sent the request. Verification method shows "Secretary (approved by Faculty)" in roll calls, attendance logs and exports.
- It counts exactly like a Faculty correction: attendance rates, grades and remedial status recompute as usual; the audit keeps old and new status, the Secretary, the approving Faculty member and the original face check-in result (ATT-006).
- Rejecting leaves the record unchanged.

## Requests that close by themselves (status rejected, with a note)

| Event | Note |
| --- | --- |
| Faculty mark or correct that student directly | "Faculty recorded attendance directly" |
| The session is revoked | "Session revoked" |
| The student checks in by face while a first-mark request is pending | "Student checked in by face" |

Pending requests otherwise never expire. A Faculty-approved Excused record still cannot be changed by the Secretary (2026-10-22 amendment).

## Data (additive migration)

`attendance_excused_requests` gains `requested_status text not null default 'excused'`, checked `in ('present','late','absent','excused')`. Existing rows stay Excused requests. The pending-uniqueness index stays (one pending request per student per session). No table rename.

## API

| Endpoint | Change |
| --- | --- |
| `POST /api/secretary/attendance/override` | Creates a request instead of saving; 201 `{status:'ok', requestId, requestedStatus}`. 409 when the request equals the current status or a request is already pending (message names who sent it and when). Refused for scheduled and revoked sessions as today. |
| `POST /api/secretary/excused-requests` | Unchanged (requested_status = excused). |
| `GET /api/secretary/excused-requests` | Rows add `requestedStatus`, `decidedAt`, `decisionNote`. |
| `DELETE /api/secretary/excused-requests/{id}` (new) | The requesting Secretary cancels their own pending request. |
| `GET /api/faculty/excused-requests` | Rows add `requestedStatus`, `currentStatus`, `currentMethod`, `presentCutoff`, `lateCutoff`; only the section instructor's requests. |
| `POST /api/faculty/excused-requests/decide` | Accepts one id or a list for approve; reject takes one id and an optional note. Approve applies `requested_status` as above. |

Errors use the existing `{status:'error', message}` shape.

## Audit

New events: "Attendance change requested" and "Attendance request cancelled" (Secretary), "Attendance request approved" / "rejected" (Faculty), and the automatic closes. Each names the student, section, session, old and requested status. Approving also writes the normal attendance-change audit.

## Examples

- Secretary marks Ana Present at 8:05; request pending; Ana's row: "Present requested". Faculty approves at 9:30; record Present, time 8:05, method "Secretary (approved by Faculty)".
- Secretary requests Late for Ben; the session ends at 13:00 before Faculty decide; Ben is resolved Absent; Faculty approve at 15:00; record changes Absent → Late, audit shows both.
- Secretary requests Absent for Carla; Faculty correct Carla to Present directly; the request closes "Faculty recorded attendance directly".
- Secretary requests Present for Dan; Dan then checks in by face; the request closes "Student checked in by face".
