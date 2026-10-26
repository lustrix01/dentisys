# New class from the official class list — contract

Status: **Grilled and confirmed by the Owner** (2026-10-27, three rounds, 14 answers). Spec wording applied to `spec.md` (IMP-001). Demo approved by the Owner (2026-10-27, including the "New class" box look): [New Class From the Class List](https://claude.ai/artifact/ADv8U6ptsqt8V8L9u3SYcn). Built and validated: [class-from-class-list-2026-10.md](../class-from-class-list-2026-10.md).

Owner request (2026-10-26): importing the Dean's class list PDF must not require the class to exist already. When it does not exist, the Faculty can create it from the file in the same step.

Builds on: [official imports](official-imports.md) (PDF reading rules P1–P7, unchanged) and [lecture-only courses](lecture-only-grading.md) (units decide Lecture only).

## What exists today

- Classes & Rosters has two page-level buttons: **Create Class** and **Import Roster**. Import Roster asks for the target class first (Step 1), then the file (Step 2). A header that differs from the chosen class only warns (P5).
- The PDF reader takes only Course Code, Class Section, school year and semester from the header.
- Create Class asks for: course code and title, Dean term (current school year only), year level, section (`block`; the class name becomes `<course code>-<section>`), Lecture/Laboratory units, and meetings (component, day, start, end, room; a room is required and meetings may not overlap on a day). An existing catalog course is reused for a known code; its units change only while unrecorded or by the course's creator.

## What the official header holds (4 sample files)

```
AY 2026-2027 1st Semester
Course Code: DM 100            Class Section: DMD-1A
Course Title: Perspectives in Dentistry    Year Level: 1st Year
Academic Units: 2.0   Lab Units: 0.0
Credit Units: 2.0     Lab Hours: 0.0
Faculty: <name>
Schedules:
Mon (09:00 AM - 11:00 AM) | Lecture | CDM 1
Thu, Fri (12:00 PM - 05:00 PM) | Laboratory | CDM2
Wed (12:00 PM - 06:00 PM) | Laboratory | ---
```

Seen in the samples: DM 100 is a real lecture-only course (Lab Units 0.0); one line can hold two days; a room can be `---`; one older file has Laboratory meetings that overlap on the same day.

## Rules

| # | Rule |
|---|---|
| N1 | **Where it starts.** Inside the existing **Import Roster** dialog; no new button. Step 1's class list gets a first option **"New class from this file"** (official PDF only). Step order stays (class, then file). After an official PDF is read, Step 1 is **always** set from the file: the matching class (N2) or "New class from this file". A line under it reads "Picked from the file. Change it if this is wrong." Picking another existing class keeps today's P5 warning. (Q1, Q8) |
| N1a | **CSV import** is unchanged: no "New class" option (no header). (Q12) |
| N2 | **Class already exists.** A match is the signed-in Faculty's **own** current-year class with the same course code, section, school year and semester; another Faculty's class does not count. The dialog says "This file matches **DM 100-DMD-1A**. Import into it?" with **Import into this class** (today's flow continues) and **Cancel**. No duplicate class is created from a matching file. (Q2) |
| N3 | **New class form.** "New class from this file" shows the Create Class fields inside the dialog, prefilled from the header and all editable: course code, course title, section, year level ("1st Year" → 1), Lecture units (= Academic Units), Laboratory units (= Lab Units), Dean term (from "AY … Semester"). Same validation as Create Class. A file with Laboratory units 0 makes a lecture-only class. |
| N3a | **Course already in DentiSys with different units.** DentiSys's units are kept, with an amber note: "This file says Lecture 2 · Laboratory 0; DentiSys has Lecture 2 · Laboratory 2 for DM 100. Ask the course's creator to change them in Classes & Rosters." When DentiSys has no units recorded, the file's units are saved. (Q5) |
| N4 | **Schedules.** Each schedule line becomes meeting rows (one per day; "Thu, Fri" → two rows) with component, start and end time and its own room, shown for the Faculty to confirm or change. A room of `---` is left empty and must be typed. Overlapping meetings show Create Class's existing error and must be fixed. A line that cannot be read is listed as "Not read: <line>" and the Faculty adds it by hand. (Owner 2026-10-26, Q6) |
| N5 | **Cannot create.** No Dean term for the file's school year and semester: "No term for AY 2026-2027 1st Semester. Ask the Dean to add it." File for a past school year: "This file is for AY 2025-2026. New classes can only be made for the current school year." Importing into an existing class is unaffected. (Owner 2026-10-26, Q7) |
| N6 | **Saving.** The Faculty reviews the class form and the student rows and ticks the existing "I reviewed the source course, section, semester and school year against the selected target class." box. The button reads **"Create class and add 25 students"** (today's "Confirm & Import (25) Students" for an existing class, unchanged). At least one ready student is needed; otherwise the button is disabled with "No students are ready to add. To make an empty class, use Create Class." (Q10, Q11) |
| N6a | **Order and failure.** The class is created first (existing Create Class endpoint and audit entry), then the students with today's import rules and audit batch. If adding students fails, the class stays, the dialog switches to it and says "Class created. Students were not added: <reason>. Try again."; the retry never creates a second class. (Q3) |
| N6b | **Success.** The dialog closes with "Class DM 100-DMD-1A created and 25 students added." and the new class shows in the list. Invitations stay a separate step. (Q9) |
| N7 | **Faculty name in the header** is ignored; the signed-in Faculty owns the new class. (Q4) |
| N8 | **Unchanged:** reading rules P1–P7, crossed-out rows, email rules, existing-student matching, invitations sent separately, the file stays in the browser, importing into an existing class, Create Class itself. |
| N9 | **Test data.** Real class lists stay out of the repo and off the demo site. Tests and the demo live check use a made-up PDF in the official layout (lecture-only "DM 100 · DMD-1A", fake students, "Mon (09:00 AM - 11:00 AM) \| Lecture \| CDM 1"); the class it creates stays on the demo as test data. (Q13) |

## Owner answers (grill, 2026-10-27)

| # | Question | Answer |
|---|---|---|
| Q1 | Entry point | Inside Import Roster, automatic pick (N1) |
| Q2 | What counts as existing | Only the Faculty's own classes (N2) |
| Q3 | Students fail after the class is created | Keep the class, retry (N6a) |
| Q4 | Header Faculty name | Ignore (N7) |
| Q5 | Course exists with different units | Keep DentiSys units, amber note (N3a) |
| Q6 | Rooms | One room per meeting row (N4) |
| Q7 | Past school year file | Cannot create; message (N5) |
| Q8 | File overrides Step 1 | Always pick from the file; changeable (N1) |
| Q9 | After success | Close, message, class in list (N6b) |
| Q10 | No ready students | Button disabled; use Create Class (N6) |
| Q11 | Button wording | "Create class and add N students" (N6) |
| Q12 | CSV | Unchanged (N1a) |
| Q13 | Test files | Made-up official-layout PDF (N9) |
| Q14 | Order | Spec after grill, demo approval, then code |

## Spec change (applied 2026-10-27)

IMP-001: added the Owner decision (2026-10-27) after "File headers are checked against the selected class and differences are warnings." The official-imports contract rule P5 points here.

## Implementation impact (after demo approval)

- Frontend: header parsing for title, year level, units and schedules (`utils/rosterImportHelper.ts`); Import Roster dialog (`components/RosterImportModal.tsx`): new option, auto-pick, match prompt, prefilled form and meeting rows, messages, button, create-then-import with retry.
- Backend: none expected; the existing Create Class and enrollment endpoints are reused (confirm during the build that the class list and catalog responses carry what the match and N3a need).
- Tests: header and schedule parsing on made-up text (two days per line, `---` room, unreadable line), auto-pick and match, N3a note, N5 messages, button states, partial-failure retry; mocked e2e for the new-class path; live spec with the made-up PDF.
