# Simpler attendance session creation (backlog 12.3): v3

Status: agreed in /grill-me 2026-11-15. Spec amendment text (ATT-001, UI-001) to be drafted for approval before build. No code.

## 1. What exists now

One pop-up, **Start Session** (`components/StartSessionModal.tsx`), used by Faculty (Attendance Monitoring) and Secretaries (Attendance List): class, date, the class's weekly meetings as chips (they fill the times), four required times (`SessionTimeFields`: opening, Present cutoff, Late cutoff, class end), room (Dean's list or custom), Face biometric (on by default), Geofence (off by default) with map and radius 50–2,000 m, then the overlap check (Go back / Book anyway).

Fixed points kept: UI-001 wording "Start session", "Schedule session", "Sessions"; the session panel hides while a session is live; the overlap pop-up, the 12-hour limit, the required room and sessions that end after midnight ("next day") (ATT-001).

Owner's pain point: setting up a session is tedious, above all picking times from a long scrolling drop-down.

## 2. Time picker (agreed: tap picker with AM/PM)

Replaces the scrolling time drop-downs in Start Session, Schedule session and Edit session.

- **Opening time**: hours 1–12 as a row of buttons, an **AM / PM** switch, minutes 00 / 15 / 30 / 45 as buttons. A small typed field accepts any time ("8", "830", "8:05", "1:30p", "19:00"), so any minute is still possible.
- **Present cutoff, Late cutoff**: chips counted from the opening time, "+10 / +15 / +30 / +45 min", or **Custom** (the same tap picker).
- **Class end**: chips "+1 h / +1.5 h / +2 h / +3 h", or **Custom**. A custom end earlier than the opening is the next day, shown as "(next day)", as today.
- Nothing is lost: any time of day (for example 7:00 PM to 11:00 PM), any minute, next-day ends, and every existing validation message stay.
- Phone: buttons at least 44 px; the picker fits 320 px without sideways scrolling.

## 3. One-tap start, defaults, folded settings (agreed)

- **One-tap start**: "Start session" for the meeting happening now or next opens already filled from the class schedule (date, times, room, face and geofence as the class's saved choices). Press **Start session**; everything stays editable.
- **Default grace periods**: Present until opening + 15 min, Late until opening + 30 min; when Faculty change them, they are saved on the class and used next time.
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
