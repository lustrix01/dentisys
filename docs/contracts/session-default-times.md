# Start Session defaults from the class schedule — contract

Status: **Grilled and confirmed by the Owner** (2026-10-27, two rounds, 9 answers). No spec change (the spec has no rule about these defaults). Demo approved by the Owner (2026-10-27, including the line under the chips): [Start Session Defaults](https://claude.ai/artifact/CLSA9CJUhqkhLHKumWfwuE). Built and validated: [session-default-times-2026-10.md](../session-default-times-2026-10.md). The approved face wording is also used in the edit-session form, and the Secretary dashboard API gained `meetings` so the Secretary form gets chips (S7). Ships together with the held fixes 3d8929f (radius) and 0fb0993 (2FA setup).

Client suggestion (2026-10-27): when a session is started, its times should default to the class's scheduled time. Owner (2026-10-27): follow Claude's recommendation for classes with several meetings.

## What exists today

- Start Session (Faculty and Secretary, one component: `frontend/src/components/StartSessionModal.tsx`) always opens with fixed times: Opening 08:00, Present cutoff 09:00, Late cutoff 12:00, Class end 13:00, today's date (Asia/Manila), and the class room when known. Every field is editable. Started at night or in the afternoon, these times are already past or far ahead (seen on the demo: a 01:35 start became a session "scheduled for 08:00").
- Each class stores its meetings: component (Lecture/Laboratory), weekday, start, end and room. A class can have several meetings, on different days or on the same day.
- Server rules (unchanged): opening < present cutoff < late cutoff ≤ class end; the end time must not have passed.
- Student self check-in always uses the face check; the session's "Face biometric" switch does not change that (off = Faculty/Secretary mark attendance in the roll call).

## Rules

| # | Rule |
|---|---|
| S1 | **Which meeting.** Among the class's meetings on today's weekday (Asia/Manila), the one under way now (start ≤ now < end); otherwise the next one later today. That meeting prefills the form. A meeting already under way is still chosen even if its Present cutoff has passed. (Q2) |
| S2 | **Prefilled values** from that meeting: Opening = start − 15 min; Present cutoff = start + 15 min; Late cutoff = start + 30 min; Class end = meeting end; Room = meeting room. If the meeting is shorter than 30 minutes, Late cutoff = meeting end (and Present cutoff stays before it). (Q1) |
| S3 | **Meeting chips.** Above the times, the class's meetings are listed as chips, e.g. "Mon · Lecture · 09:00–11:00 · CDM 1", ordered Mon→Sun then by start. The chosen meeting is highlighted. Clicking a chip replaces the four times and the room with that meeting's values (S2), even if they were edited by hand; the date never changes. (Q3, Q5, Q8) |
| S4 | **No meeting today, or all of today's meetings are over:** today's fixed defaults (08:00 / 09:00 / 12:00 / 13:00) and today's date stay; the chips are still shown and nothing is highlighted. (Q5) |
| S5 | **Class with no meetings recorded:** exactly today's behaviour (fixed defaults, class room if known, no chips). (Q7) |
| S6 | Every field stays editable after prefilling; nothing is saved until **Start Session**; server validation is unchanged. |
| S7 | Applies to the Faculty and the Secretary Start Session (same component). The edit-session form is unchanged. (Q4) |
| S8 | **Face biometric wording.** The line under the "Face biometric" switch changes from "Require verified attendance" to **"On: students check in with their face. Off: you mark attendance in the roll call."** Wording only; no behaviour change. (Q6) |

## Example

Class meetings: Mon 09:00–11:00 Lecture CDM 1; Mon 13:00–16:00 Laboratory CDM 2; Thu 12:00–17:00 Laboratory CDM 2.

| Started (Manila) | Prefilled |
|---|---|
| Mon 08:40 | Lecture: 08:45 / 09:15 / 09:30 / 11:00, CDM 1 |
| Mon 09:40 | Lecture (under way): 08:45 / 09:15 / 09:30 / 11:00, CDM 1 |
| Mon 11:30 | Laboratory (next today): 12:45 / 13:15 / 13:30 / 16:00, CDM 2 |
| Mon 17:00 | Fixed defaults; chips shown, none highlighted |
| Tue 10:00 | Fixed defaults; chips shown; clicking "Thu · Laboratory" fills 11:45 / 12:15 / 12:30 / 17:00, CDM 2, date stays Tue |

## Owner answers (grill, 2026-10-27)

| # | Question | Answer |
|---|---|---|
| Q1 | Minutes | −15 / +15 / +30 / meeting end (S2) |
| Q2 | Meeting under way | Prefill it (S1) |
| Q3 | Other meetings | Chips (S3) |
| Q4 | Secretary | Same (S7) |
| Q5 | No meeting today | Fixed defaults; chips fill times and room only, never the date (S3, S4) |
| Q6 | Face biometric wording | Changed (S8) |
| Q7 | Class without meetings | Today's behaviour, no chips (S5) |
| Q8 | Chip after manual edit | Replaces times and room (S3) |
| Q9 | Spec and order | No spec change; demo, then code; ships with the held fixes |

## Implementation impact (after demo approval)

- Frontend only: `StartSessionModal.tsx` (a pure helper picking the meeting and computing the four times, chips, wording) and the callers that open it (Faculty `AttendanceMonitoring.tsx`, Secretary attendance page) passing the class's meetings.
- Tests: helper cases from the example table (incl. under way, next today, none today, short meeting, midnight boundaries), chip replace behaviour; mocked e2e for the Faculty form.
