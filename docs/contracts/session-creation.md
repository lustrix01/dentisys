# Simpler attendance session creation (backlog 12.3): v3

Status: agreed in /grill-me 2026-11-15; decisions 2026-11-16 in section 6; spec amendment in section 7 approved 2026-11-16.

## 1. What exists now

One pop-up, **Start Session** (`components/StartSessionModal.tsx`), used by Faculty (Attendance Monitoring) and Secretaries (Attendance List): class, date, the class's weekly meetings as chips (they fill the times), four required times (`SessionTimeFields`: opening, Present cutoff, Late cutoff, class end), room (Dean's list or custom), Face biometric (on by default), Geofence (off by default) with map and radius 50–2,000 m, then the overlap check (Go back / Book anyway).

Fixed points kept: UI-001 wording "Start session", "Schedule session", "Sessions"; the session panel hides while a session is live; the overlap pop-up, the 12-hour limit, the required room and sessions that end after midnight ("next day") (ATT-001).

Owner's pain point: setting up a session is tedious, above all picking times from a long scrolling drop-down.

## 2. Time picker (clock-style wheel)

Replaces the scrolling time drop-downs in Start Session, Schedule session and Edit session.

- **All four times** (Opening, Present Cutoff, Late Cutoff, Class End Time): one field showing e.g. "7:45 PM". Selecting it lets you type a time ("8", "830", "8:05", "1:30p", "19:00"; Enter or leaving the field commits, an unreadable entry reverts) and opens a flyout under it with three scrolling columns: hours 1–12, minutes 00–59 and AM/PM. The selected value sits in a highlighted band with two neighbours each side; hours and minutes loop. Mouse wheel, swipe/drag, the up/down arrows, a click on a neighbour, ArrowUp/ArrowDown/PageUp/PageDown/Home/End and typed digits all move a column. **Cancel** (or Escape) restores the value from when the flyout opened; **Done** keeps it. One flyout is open at a time.
- A time earlier than the opening is the next day, shown as "(next day)", as today.
- Nothing is lost: any time of day (for example 7:00 PM to 11:00 PM), any minute, next-day ends, and every existing validation message stay.
- Phone: buttons at least 44 px; the picker fits 320 px without sideways scrolling.

## 3. One-tap start, defaults, folded settings (agreed)

- **One-tap start**: "Start session" for the meeting happening now or next opens already filled from the class schedule (date, times, room, face and geofence as the class's saved choices). Press **Start session**; everything stays editable.
- **Default grace periods**: opening 15 min before the meeting, Present until opening + 30 min, Late until opening + 45 min (Owner 2026-11-16); when Faculty change them, they are saved on the class and used next time.
- **More settings**: cutoffs, face, geofence, map and radius are folded under "More settings" with a one-line summary ("Present until 8:15 AM · Late until 8:30 AM · Face on · Geofence off").

## 4. Auto-sessions from the weekly schedule (agreed)

- A class setting **Create sessions from the weekly schedule**, with the class's saved choices: face on/off; geofence on/off with the room's location and radius.
- **Rolling week** (agreed): DentiSYS keeps sessions created for the class's meetings in the next 7 days, topped up daily, until the term ends.
- Only the class's Faculty turn it on or off. Secretaries keep running sessions as today.
- Each meeting becomes a normal scheduled session that Faculty can edit or revoke (holidays included; there is no holiday calendar).
- **Conflicts when turning it on**: before saving, DentiSYS checks the class's meetings against other classes' sessions and auto-sessions (same room, same Faculty, weekly schedules: the existing ATT-001 overlap rules). If any conflict, the Faculty sees the overlap pop-up (Go back / Turn on anyway). On Turn on anyway, the other class's Faculty gets an in-app notice and the confirmation is audited.
- **Conflicts when a session is created later** (for example a new booking appeared since): the session is still created, and the class's Faculty and the other class's Faculty get an in-app notice listing the overlap.

- **Turning it off** (agreed): future auto-sessions that have not opened are removed (revoked); open and past ones stay.
- **Changing the weekly schedule while it is on** (agreed): the existing upcoming auto-sessions are changed to the new schedule. Before saving, a warning says how many upcoming sessions will change ("This changes 4 upcoming sessions."), with Go back / Save; sessions not created yet simply follow the new schedule.

## 5. Out of scope

Holiday calendar; repeating schedules for one-off sessions; changes to how attendance itself is taken.

## 6. Decisions 2026-11-16

- 12.3 and 12.4 are built together in one batch.
- A revoked or edited auto-session is left alone: the daily top-up never creates a revoked one again, and a weekly-schedule change does not overwrite an edited one.

## 7. Spec amendment (approved by the Owner 2026-11-16, in spec.md)

**ATT-001, two new paragraphs before "History":**

> Session time entry (Owner decision 2026-11-16). Start session, Schedule session and Edit session show each of the four times (opening, Present cutoff, Late cutoff, class end) as one field. Selecting a field opens a picker like the Windows Clock alarm: scrolling hour (1–12), minute (00–59) and AM/PM columns that respond to the mouse wheel, swiping, the arrow buttons and the keyboard, and the time may also be typed while the field is selected ("8", "830", "8:05", "1:30p", "19:00"). Phones use the same picker. A class end earlier than the opening is the next day. Every timing rule and message above stays. Controls are at least 44 px and the picker fits a 320 px wide screen without sideways scrolling.
>
> Start session opens filled for the class's weekly meeting happening now, else its next meeting (date, room, opening 15 minutes before the meeting starts, class end at the meeting end; a later date makes it Schedule session), with the class's saved face and geofence choices; every field stays editable. Each class has grace periods, by default Present until opening + 30 min and Late until opening + 45 min (Owner decision 2026-11-16: for an 8:00 AM meeting, opens 7:45 AM, Present until 8:15 AM, Late until 8:30 AM, as before); when the class's Faculty start, schedule or edit a session with other grace periods, those become the class's grace periods. The cutoffs, face, geofence, map and radius are under More settings, closed by default, with a one-line summary ("Present until 8:15 AM · Late until 8:30 AM · Face on · Geofence off").

**New ATT-008 — Sessions from the weekly schedule (Status: APPROVED, Owner decision 2026-11-16):**

> A class's Faculty may turn on Create sessions from the weekly schedule. The class keeps its choices: face on or off, and geofence on or off with a radius (50–2,000 m, ATT-002). A geofenced auto-session uses its meeting room's saved location; geofence cannot be turned on while one of the class's meeting rooms has no saved location. Only the class's Faculty turn the setting on or off or change its choices; Secretaries keep running sessions as today.
>
> While it is on, DentiSYS keeps one scheduled session for each weekly meeting of the class in the next 7 days (Asia/Manila), created at turn-on and topped up daily, up to the end of the class's term and never for an archived class. Each is an ordinary scheduled session with that meeting's date, times and room and the class's grace periods, created by the class's Faculty and labelled "Auto" in Sessions. Faculty edit or revoke it like any scheduled session (holidays included; there is no holiday calendar). A revoked auto-session is not created again, and an edited one keeps its edit. A meeting that overlaps a session the class already has is skipped.
>
> Turning it on checks the class's meetings in the next 7 days against other classes under ATT-001 (a)–(c). Any overlap shows the overlap pop-up with Go back and Turn on anyway; Turn on anyway notifies each overlapped class's Faculty in-app and is audited. An auto-session created later that overlaps another class is still created, and the Faculty of both classes get an in-app notice listing the overlap.
>
> Turning it off revokes the class's auto-sessions that have not opened; open and past sessions stay. Changing the weekly schedule while it is on first warns "This changes N upcoming sessions." with Go back and Save; on Save, unedited upcoming auto-sessions follow the new schedule, those of removed meetings are revoked, and added meetings get their sessions at once.

**Audit (docs/contracts/audit-logging.md 5.5, Faculty own view):** "Auto-sessions turned on", "Auto-sessions turned off", "Auto-session settings changed", "Class grace periods changed". Sessions created or revoked by the daily top-up use the existing session events with the actor "DentiSYS (weekly schedule)", one batch per run.
