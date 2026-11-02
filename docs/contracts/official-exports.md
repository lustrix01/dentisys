# Exports in .xlsx and the official layouts — contract

Status: **Grilled and demo approved** (2026-10-27). Demo: [Official Exports Demo](https://claude.ai/artifact/7dEGzt1Qf6EXzcF7fEHqx2). X23–X26 were added from the demo and approved with it.

Owner request (2026-10-27): "move from .csv to .xlsx and improve the format of the export file … since we now know the original official files (importing of user list and grades), maybe we can tackle a better export so that it has the same layout? if possible".

## 1. What exists today

| # | Screen and button | Who | Today's file | Columns today |
|---|---|---|---|---|
| E1 | Grade Computation → Export (Grade Summary) | Faculty | `DENT101_Grade_Summary.csv` | Student Number, Student Name, Midterm Lec %, Midterm Lab %, Midterm %, Finals Lec %, Finals Lab %, Finals %, Overall Grade, Status |
| E2 | Reports → Academic → Export | Faculty | `DENT101_Academic_Report.csv` | Student Number, Name, Course Code, the same six %s, Grade, Remarks |
| E3 | Reports → Retention → Export | Faculty | `Retention_Report.csv` | Student Number, Name, Standing Grade, At-Risk Courses, Risk Level, Remedial Status |
| E4 | Reports → Attendance → Export | Faculty | `Attendance_DENT101_2026-10-27.csv` | Date, Student Number, Name, Course Code, Status |
| E5 | Dean Reports → Students / Retention / Attendance → Export | Dean | `Student_Summary_<time>.csv` etc. | per tab (Student Number, Name, Class, Grade, Status, …) |
| E6 | Audit Trail → Export | every role with an Audit Trail | `dentisys-audit-trail-<date>.csv` | the audit rows |

All are built in the browser (no server endpoint) with a UTF-8 BOM and a formula guard. The two import templates (roster CSV template, score template) are inputs, not exports, and are unchanged.

## 2. Official grade sheet layout (from `SAMPLE.xlsx`, structure only)

- Sheets: one per component (Lecture "Sheet2", Laboratory "dental"), then `TFG` (summary) and `DATA` (percent → grade table).
- Component sheet:
  - Rows 1–5, column M: `Republic of the Philippines` / `BICOL UNIVERSITY` / `COLLEGE OF DENTAL MEDICINE` / `OPERATIVE DENTISTRY 1 (LEC)` / `2ND SEMESTER, AY 2025-2026`. Row 6: `DENTAL`.
  - Row 7: headers, merged down to row 9. Midterm half, then Finals half. Each category is its items, then a total or average column, then the weight (`0.1`, `0.2`, `0.5`). The Midterm half ends `MIDTERM GRADE | EQUIV. | Midterm 30%`. The Finals half ends `FINAL GRADE | Final 70% | EQUIV. | Over All FG | EQUIV.`
  - Row 9: each item's max, followed by a `%` column holding the transmuted percent. Max `0` = unused slot. Recitation and Lab Performance have no max (a percent out of 100).
  - Rows 10+: `No. | Names | …`. Panes frozen at C10, header fill lilac `#E1BEE8` in bold, Names column wide (≈51). No footer or signature block.
  - Every computed cell is an Excel formula. `EQUIV.` looks up `DATA`.
- `TFG`: `No. | NAME | MIDTERM LEC GRADE | MIDTERM LAB GRADE | TOTAL | MG (30%) | FINAL LEC GRADE | FINAL LAB GRADE | TOTAL | TFG (70%) | FG (100%) | MG EQUIV | TFG EQUIV | FG EQUIV`.
- `DATA`: `PERCENT % | PS`, one row per whole percent.

The class list is a PDF: a header block (Course Code, Title, Section, Year Level, Units, Faculty, Schedules, term), then `# | Student No. | Program | Name | Gender | Year Level | Contact #`.

## 3. Rules (all Owner-approved, 2026-10-27)

### Grade workbook (E1 and E2)

| # | Rule |
|---|---|
| X1 | Grade Computation → Export downloads the official grade workbook. Faculty Reports → Grades & Assessments → Export Excel downloads the five-sheet report bundle in X28 and does not replace the Grade Computation workbook. |
| X2 | The official Grade Computation workbook has sheets `LEC`, `LAB`, `TFG`, `DATA`. A lecture-only course has no `LAB` sheet. Layout as §2: title rows, header rows 7–9 (merged as the sample), `No. \| Names`, panes frozen at C10, bold lilac `#E1BEE8` header, the sample's column widths, landscape. |
| X3 | LEC/LAB rows 1–6: `Republic of the Philippines` / `BICOL UNIVERSITY` / `COLLEGE OF DENTAL MEDICINE` / course title in capitals + ` (LEC)` or ` (LAB)` / `1ST SEMESTER, AY 2026-2027` / the section (e.g. `DMD-3A`). Rows 4–5 match what the importer checks (G9). |
| X4 | One item column (plus its `%` column) per real DentiSys assessment, in each period, component and category; no empty `0` slots. Categories in Grade Weights order. Row 9 holds each item's max; Recitation and Lab Performance have none. |
| X5 | Every split the sheet prints comes from the class's saved Grade Weights: category weight cells (`0.1`), `Midterm 50%`, `Final 50%`, `MG (50%)`, `TFG (50%)`, and the Lec/Lab shares in `TFG`. |
| X6 | **Values, not formulas.** Every computed cell holds the number DentiSys computed under the official calculation (spec, 2026-10-26 option B). |
| X7 | Formats: item `%` and category totals to 2 decimals; period grades and `TFG` columns as whole percents; EQUIV. as the app shows grades (`2.5`, `1.75`, `5.0`). All are numbers, not text. |
| X8 | A missing score is a blank cell, its `%` cell is blank, and every grade that depends on it (category total, period grade, EQUIV., `TFG`) shows `INC`. Nothing shows 0 for a missing score. |
| X9 | Lecture-only `TFG`: `No. \| NAME \| MIDTERM GRADE \| MG (50%) \| FINAL GRADE \| TFG (50%) \| FG (100%) \| MG EQUIV \| TFG EQUIV \| FG EQUIV`. MG and TFG show 1 decimal because DentiSys rounds a lecture-only course grade once, so the row adds up (`42.5 + 46.0 = 88.5 → 89`). Lecture + Laboratory courses keep the official whole-number steps. |
| X10 | `DATA`: `PERCENT % \| PS`, whole percent 0–100 → DentiSys's grade (99–100 = 1.0 … 75 = 3.0, below 75 = 5.0). |
| X11 | Names as `LAST, First Middle`, sorted by last name, numbered from 1. No student numbers, no remediation/retention/status columns, no signature block. |
| X12 | **Round trip.** Importing the exported workbook into the same class finds every student and assessment and changes nothing. Automated test. |
| X13 | File: `<Course>_<Section>_Grade_Sheet_<School year>_<Semester>.xlsx`, e.g. `DM116_DMD-3A_Grade_Sheet_2026-2027_1st.xlsx`. |

### Class list (new)

| # | Rule |
|---|---|
| X14 | Classes & Rosters gets class-list **Export Excel** and **Export PDF** controls for the selected class. Only the Faculty assigned to that class can use them. |
| X15 | One `.xlsx` sheet laid out like the official PDF: the header block (Course Code, Course Title, Class Section, Year Level, units, Faculty, Schedules, term), then `# \| Student No. \| Program \| Name \| Gender \| Year Level \| Contact #`. The Name cell holds `Last, First Middle` and the institutional email on a second line. |
| X16 | Program comes from the section name (`DMD-1A` → `DMD`). Gender and Contact # come from the student record when stored, else blank. The class-list import is not changed. |
| X17 | File: `<Course>_<Section>_Class_List_<School year>_<Semester>.xlsx`. |

### Every export

| # | Rule |
|---|---|
| X18 | Every export in §1 downloads `.xlsx`. No CSV export remains, the Audit Trail included. Other file names keep today's pattern with `.xlsx`. |
| X19 | E3–E6 start with `Republic of the Philippines` / `BICOL UNIVERSITY` / `COLLEGE OF DENTAL MEDICINE`, then the report name, the class or filter, the term, and `Exported 27 Oct 2026 14:05 (Manila) by <name>`. Then one bold, frozen header row, real numbers and dates, landscape. No filter buttons (the library cannot add them). |
| X20 | Past and archived classes can still be exported. Only currently enrolled students are included, as today. |
| X21 | Who can export what and which rows are included are unchanged. Audit events keep their module and role; only the wording changes: "Exported grade sheet", "Exported report", and the new "Exported class list". |
| X22 | New frontend dependency `write-excel-file` (same author as `read-excel-file`, one sub-dependency `fflate`). Files are built in the browser and never uploaded. |
| X23 | Row 8 of LEC/LAB holds each assessment's DentiSys title over its score and `%` columns (the official sheet leaves row 8 empty). Row 7 holds the category name over its first item. The importer uses a row-8 title when present and otherwise behaves as today, so official files import unchanged and an exported file re-imports with no changes (X12). |
| X24 | In Lecture + Laboratory classes, the LEC and LAB sheets' `Midterm 50%`, `Final 50%` and `Over All FG` columns show that component alone, in whole percents (`Over All FG` = round(round(Midterm × share) + round(Final × share))), as the official Lab sheet does. They are for reading only; the course grade is on `TFG`. |
| X25 | `TFG`'s `MIDTERM LEC GRADE`, `MIDTERM LAB GRADE`, `FINAL LEC GRADE` and `FINAL LAB GRADE` hold the component grade × its share (e.g. Lecture × 60%) with 2 decimals, as the official TFG, so `TOTAL` adds up. |
| X26 | Export buttons say "Export Excel" instead of "Export CSV" (tooltips and aria labels too). Class-list exports use the grouped **Export Excel** and **Export PDF** controls. |
| X27 | **Export PDF** opens a styled, landscape class list with the same header details and roster columns as X15. The browser print dialog lets Faculty save the styled document as PDF, named `<Course>_<Section>_Class_List_<School year>_<Semester>.pdf`. The existing `.xlsx` export and filename in X17 remain available. |
| X28 | **Faculty Reports → Grades & Assessments** downloads a report-only `.xlsx` workbook with five sheets, in this order: (1) `Assessment Scores` — a Grade Computation-style student-by-assessment matrix for enrolled students and non-archived assessments in the selected class, grouped by Midterm/Finals, component, and category; each assessment shows its maximum score, saved score, and score percentage, with missing scores blank; (2) `Grade Summary` — Student Number, Student Name, Midterm period percentage, Finals period percentage, overall Final Course Grade, and Remarks, using the existing server-computed period and course results; (3) `Midterm Watchlist` — selected-class records flagged at risk by the server, including student, class, complete midterm percentage/grade, risk standing and computed status; (4) `Attendance Register` — the selected class, attendance date and session roster/status; (5) `Interactive Analytics` — visual graphs for retention standings, grade distribution, and assessment averages, followed by the labeled source data. The workbook is scoped to the selected class and current report filters. **Export PDF** prints the same five report sections, in the same order, with the assessment matrix and analytics graphs. The Faculty Reports bundle is not the Grade Computation import-compatible workbook; the Grade Computation export remains unchanged. |

## 4. Next steps

1. Implementation by subagents, with the round-trip test (X12) on made-up rows, then `./scripts/check.ps1`.
