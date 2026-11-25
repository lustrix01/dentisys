# Review findings (not yet clarified)

Defects found by the `ui-review` and `responsive-check` agents and verified by a blind judge against the screenshots and the code, but not yet clarified with the Owner. They are real but not approved work: the Owner reads a row, decides the fix, and moves it to [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md) as a numbered item (then deletes the row here). Findings already in the backlog are not repeated.

Severity follows `.claude/agents/ui-review.md`: High = cut-off or split text, a missing dark-mode pair, a broken state; Medium = an existing layout or behaviour that misleads; Low = polish. "Seen" names the shot (D = Desktop 1920, P = iPhone 393, then the state id); "code" means the state is not in the capture and was checked in code. Evidence (reports, shots, judge verdicts) is in the git-ignored `audit-output/ui-review/<role>-<route>/` folder of the machine that ran the review.

## Faculty Reports (`frontend/src/pages/faculty/Reports.tsx`), reviewed 2026-11-25

Already in the backlog: 9.28 (capitals), 9.33, 9.34, 9.35, 12.6 (page wrapper).

| id | sev | defect | where | seen |
|---|---|---|---|---|
| RF-R1 | High | Phone attendance calendar opens off the left edge ("ovember 2026") and past the bottom of the screen | :1214 `absolute right-0 w-72` | P07 light |
| RF-R2 | High | Phone attendance Date cell wraps "Nov / 11, / 2026" | :1298, no `whitespace-nowrap` | P06 light |
| RF-R3 | High | Phone attendance column headers split ("STUDENT / DETAILS", "SUBJECT / CODE", "RECORDED / STATUS") | :1286-1289 | P06, P07 light |
| RF-R4 | High | Donut keeps the Recharts white stroke: white outline and seam in dark mode | :1345-1356, no `stroke` | D11 dark, P10 dark |
| RF-R5 | High | Assessment labels cut to 15 characters, the tooltip shows the cut name too, and phones show 2 of 4 labels | :819 `substring(0,15)`, :1414 | D11, P10 dark |
| RF-R6 | High | A 5.0 "IRREGULAR REENROLLMENT" grade shows the green PASS pill (only `'FAILED'` is rose, and no row produces it) | :501 vs :866-872 | code |
| RF-R7 | High | `loading` and `error` are set but never shown: a failed load reads "No student records" | :116-117, :178 | code |
| RF-R8 | Medium | Grades columns move between page 1 and page 2 (MIDTERM x 1055 to 1016) | grades table | D01 vs D03 |
| RF-R9 | Medium | Phone grade list has its own `max-h-[480px]` scroller; row 5 is cut | :991 vs index.css:79 | P01 dark |
| RF-R10 | Medium | Chart tooltips use the Recharts white default, with no dark style | :1358, :1387, :1416 | code |
| RF-R11 | Medium | Retention row ID line has no grey pair; `text-rose-500` has no dark pair | :1163, :1169 | code |
| RF-R12 | Low | Calendar selected day is `bg-emerald-700`, not the role colour `clinical`; weekday letters `text-slate-400` | :1237, :1220 | D08 light |
| RF-R13 | Low | Chart colours are hard-coded hex, indigo vs teal bars, neither the role colour; gridlines invisible on dark cards; one-slice donut shows a notch (`paddingAngle={3}`) | :787-789, :1351, :1384-1388, :1413-1417 | D11 |
| RF-R14 | Low | Developer words "Authoritative", "persisted"; remark strings typed in ALL CAPS | :1196, :1282, :1294, :1339, :1405; :500-503 | D08, P06 |
| RF-R15 | Low | Column header "Subject Code" but the export says "Course Code"; donut legend words differ from the spec statuses (spec.md:1158) | :1288 vs :698; :787-789 | code |
| RF-R16 | Low | Retention empty state names only the school year, with no hint line (features.md:56) | :1150 | code |
| RF-R17 | Low | Date button `dark:bg-slate-950` next to the export button's `slate-900` | :1208 vs ExportMenu.tsx:30 | code |
| RF-R18 | Low | Retention Excel header says "All assigned classes" while the rows are one class | :682 vs :614-616 | code |
| RF-R19 | Low | `p-0` on the tab cards is dead (Card's `p-6` wins), so content sits 24 px in | Card.tsx:34 | D03 |

## Faculty Dashboard (`frontend/src/pages/faculty/Dashboard.tsx`), reviewed 2026-11-26

Already in the backlog: 9.28 (capitals).

| id | sev | defect | where | seen |
|---|---|---|---|---|
| RF-D1 | High | Search "Course" chip `bg-clinical-100 text-clinical-700` has no dark pair | :479 | code |
| RF-D2 | High | Record Remedial Score dialog: `text-rose-500`, `text-amber-600`, the "Open in Retention Monitoring" link and Cancel have no dark pair | :625, :626, :712, :720 | code |
| RF-D3 | High | Clicking a Course search result only sets `selectedSubjectCode`, which nothing reads, and clears the search: the click does nothing | :124, :148-151, :475 | code |
| RF-D4 | High | Class Details room chip breaks across lines ("Room 301 (Wed 02:30 PM - / 03:30 PM)") and squeezes the course name | :563, :573 | D01, P01 |
| RF-D5 | High | Phone Recent Activity splits codes and dates mid-code ("LIVE-LO- / MVPFKPKE", "2026-11- / 23T…") | components/AuditTrailPage.tsx:48 `break-words` | P01 |
| RF-D6 | Medium | Dialog labels use `dark:text-slate-500` instead of `dark:text-slate-400` | :630, :653, :679, :693 | code |
| RF-D7 | Medium | Student search covers only one hidden class (`selectedClassId`) | :154-156 | code |
| RF-D8 | Medium | Attendance Rate tile shows one unnamed class (58%) beside all-class totals (12 classes, 46 students) | :246-247, :428 | D01 |
| RF-D9 | Medium | Recent Activity shows raw audit text "published at: 2026-11-23T19:28:36+08:00 → —" | components/AuditTrailPage.tsx:48 | D01 |
| RF-D10 | Medium | Search card around one input, with a box of white rows inside it (existing layout) | :449-496 | D02 |
| RF-D11 | Medium | Two near-identical intro paragraphs (header and workspace card) | :356, :395 | D01, P01 |
| RF-D12 | Medium | First Steps card: a card around one line, "Create class" duplicates "Manage classes", grey text not `text-slate-500 dark:text-slate-400` | :371-378 | code |
| RF-D13 | Low | Student result goes to unfiltered `/students`; result rows are `div onClick` (no keyboard access) | :473, :483-485 | code |
| RF-D14 | Low | "Current Classes" stays fixed for past or all years; the tile prints the raw year token; Class Details lists 2 of 12 classes with no "View all" | :412, :557, :562 | D01 |
| RF-D15 | Low | Error card has `p-8` and `p-6`, replaces the whole page (the year filter is gone) and has no `role="alert"` | :331-343 | code |
| RF-D16 | Low | Panels hand-built while `Card` is imported unused; wrapper adds `pb-12`; `hover:shadow-md` on a card that is not clickable | :6, :347, :388 | code |
| RF-D17 | Low | School Year filter focus ring is `accent-500` (Dean purple) on a Faculty page | components/SchoolYearFilter.tsx:25 | code |
| RF-D18 | Low | Wording: "1ST 2026-2027" typed in capitals in the activity record; developer word "Authoritative"; "Loading faculty workspace data…" lowercases the role | :84, :326, :654 | D01 |
