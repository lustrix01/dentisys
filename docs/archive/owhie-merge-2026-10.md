# Owhie's UI changes merged, October 2026

Owhie's branch `lighthal9-responsive-owhie` (`fcc4471`, five commits started from `66651d8`) was merged into `lighthal9-responsive` on 2026-10-26, with the defects found in review fixed in the same merge. The Owner approved the result after a three-way comparison of every change.

- Three-way comparison (your branch, Owhie's branch, merged): [Owhie Merge Comparison](https://claude.ai/artifact/Gvj3QaFdPJLmbsdVRAgi5r)
- Before/After demo with the logic cases: [Owhie's UI Changes Review](https://claude.ai/artifact/JXBDEy3gUt9EqEftAfyvAW)

## Taken as Owhie built it

- Landing page redesign (brighter purple, Poppins title, top menu); headings use Inter app-wide.
- Sidebar: current page shown as bold coloured text; Profile and Settings only in the avatar menu; no name footer; Dean gets **Academic Terms**.
- Big page titles and descriptions removed on about 20 pages; student pages show the Student ID at top right.
- Academic Terms page at `/admin/terms` (same API, confirmations and audit as before).
- Dean Reports: Export CSV / Print PDF beside the filters; Total Enrolled, Active Classes, Good Standing and Remedial tiles.
- Faculty dashboard without Announcements; Faculty Classes with one toolbar row and no all-students roster tab (rosters open from a class card).
- Faculty Retention and Reports: one grouped Subject/Section dropdown.
- Student class card layout, with the score beside the grade at one decimal, e.g. "(83.4%)".

Our standing UI rules from [UI polish, October 2026](ui-polish-2026-10.md) were re-applied to his new lines (labels on one line, readable small grey text, no dead Tailwind classes).

## Changed or replaced during the merge

| Owhie's branch | Merged |
|---|---|
| Login: Google-off button with no reason; development sign-in called "Quick Sign-In" | "Continue with Google" + "Google Sign-In is not configured in this environment."; "Development mock Student sign-in" label kept |
| College name cut off in the sidebar and on the phone login | Fits in the sidebar (smaller collapse button); wraps on the phone login |
| Terms on both the new page and Dean Settings; reminder opened Settings | Terms only on `/admin/terms`; reminder and breadcrumb point there |
| Roster opened with the class search still applied ("0 Students") | Opening a roster clears the search |
| Faculty theme buttons with icons only | "Clean light mode" / "Clinical dark mode" labels restored |
| Missing standing shown as "Good Standing" | Missing standing stays "Unavailable"; `active` shows as Good Standing, `cleared` as Cleared |
| "Schedule TBA" rule dropped; long schedules cut with "..." | Rule kept; schedules wrap |
| All rooms listed together after all times | Several rooms: each room beside its own time |
| Clinical hours shown only when above 0 | Shown on clinical classes (including 0 hrs) or when hours are above 0 |
| Top-bar title was an `h2` | Top-bar title is the page `h1` (same look) |
| Real-student Profile page still had its old header | Header removed to match the other pages |

Owhie's top-navbar experiment was reverted by himself before the merge, so nothing was taken from it.

## Owner rulings

- Removing features for a cleaner look (Announcements, page titles, the roster tab, sidebar Profile/Settings) is acceptable when it makes sense for users.
- Retention `active` is shown to Students as "Good Standing".
- The clinical hours chip appears on clinical classes, including 0 hrs.
- The student score is shown beside the grade with one decimal.

## How it was checked

- Type check; 155 unit tests; 241 mocked browser tests (34 updated to the new layout with the same data, API and safety checks; 3 live tests updated the same way); `scripts/check.ps1`; `scripts/check-postgres.ps1`.
- Every line Owhie added was compared with the merged code: apart from class names, only the items in the table above differ.
- Real screenshots of all three versions on the same database; logic cases shown with fixed API answers.
