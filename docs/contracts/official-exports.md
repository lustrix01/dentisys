# Exports in .xlsx and the official layouts — contract

Status: **Current contract**, implemented.

Owner request: "move from .csv to .xlsx and improve the format of the export file … since we now know the original official files (importing of user list and grades), maybe we can tackle a better export so that it has the same layout? if possible".

## 1. Background (before this contract)

| # | Screen and button | Who | Today's file | Columns today |
|---|---|---|---|---|
| E1 | Grade Computation → Export (Grade Summary) | Faculty | `DENT101_Grade_Summary.csv` | Student Number, Student Name, Midterm Lec %, Midterm Lab %, Midterm %, Finals Lec %, Finals Lab %, Finals %, Overall Grade, Status |
| E2 | Reports → Academic → Export | Faculty | `DENT101_Academic_Report.csv` | Student Number, Name, Course Code, the same six %s, Grade, Remarks |
| E3 | Reports → Retention → Export | Faculty | `Retention_Report.csv` | Student Number, Name, Standing Grade, Remedial Courses, Remedial Status |
| E4 | Reports → Attendance → Export | Faculty | `Attendance_DENT101_2026-10-27.csv` | Date, Student Number, Name, Course Code, Status |
| E5 | Dean Reports → Students / Retention / Attendance → Export | Dean | `Student_Summary_<time>.csv` etc. | per tab (Student Number, Name, Class, Grade, Status, …) |
| E6 | Audit Trail → Export | every role with an Audit Trail | `dentisys-audit-trail-<date>.csv` | the audit rows |

All are built in the browser (no server endpoint) with a UTF-8 BOM and a formula guard. The two import templates (roster CSV template, score template) are inputs, not exports, and are unchanged.

## 2. Comprehensive Grade Sheet matrix

- One Excel worksheet named `Grade Sheet`; the PDF prints a compact version as two landscape pages, one for Midterm and one for Finals.
- The title block identifies the university, college, course, section, term, and school year.
- One continuous table has `Student No. | Full Name`, followed by period groups (`Midterm`, `Finals`). Within each period, Lecture and Laboratory are adjacent component groups when the class has both; they are never split into separate sheets or pages by component.
- Each category is grouped beneath its component and shows each assessment as `Score | % | Transmuted`, followed by `Average %` and `Weighted (<category weight>%)`. A category with no discrete assessment uses one category score group while retaining its average and weighted result.
- Trailing result groups show Midterm grade and equivalent, Finals/tentative grade and equivalent, and overall final grade and equivalent. Grade equivalents are included inline; there is no separate `TFG` or `DATA` sheet.
- Headers are merged to show the period, component, category, and assessment hierarchy. Freeze the title/header rows and the two student identity columns. Use a bold iBU-style header, readable assessment labels, and landscape orientation.
- Every computed value comes from DentiSys's saved/server grade calculations; display values, ordering, and missing-score behavior follow X6–X8. No footer or signature block.

The class list is a PDF: a header block (Course Code, Title, Section, Year Level, Units, Faculty, Schedules, term), then `# | Student No. | Program | Name | Gender | Year Level | Contact #`.

## 3. Rules (all Owner-approved)

### Grade workbook (E1 and E2)

| # | Rule |
|---|---|
| X1 | Grade Computation → Export downloads the official grade workbook. Faculty Reports → Grades & Assessments → Export Excel downloads the selected summary table in X28 and does not replace the Grade Computation workbook. |
| X2 | The official Grade Computation workbook has one `Grade Sheet` worksheet. Its matrix layout follows §2: merged period/component/category/assessment headers, student number and full name, score/percent/transmuted columns, category averages and weighted contributions, and inline period/overall grade equivalents. Lecture and Laboratory share the same continuous worksheet; no component-specific sheet split. |
| X3 | The title block identifies `Republic of the Philippines`, `BICOL UNIVERSITY`, `COLLEGE OF DENTAL MEDICINE`, course title, section, semester, and school year. |
| X4 | One assessment group (`Score | % | Transmuted`) per real DentiSYS assessment, in period, component, category order; no empty `0` slots. Each category ends with Average % and Weighted columns. Categories without discrete assessments retain a category score group and their computed summary. |
| X5 | Category weights and period ratios come from the class's saved Grade Weights. The header shows each category's configured weight, and result groups show Midterm, Finals/tentative, and overall grades. |
| X6 | **Values, not formulas.** Every computed cell holds the number DentiSYS computed under the official calculation (spec, 2026-10-26 option B). |
| X7 | Formats: raw and effective assessment percentages, category averages, and weighted contributions to 2 decimals; period and overall percentages to 2 decimals; grade equivalents as the app shows grades (`2.5`, `1.75`, `5.0`). Numeric values remain numbers, not text. |
| X8 | A missing assessment score and its raw/effective percentage cells stay blank. Category averages, period grades, grade equivalents, and overall results that depend on the missing score show `INC`. Nothing shows 0 for a missing score. |
| X9 | The combined matrix's result groups show Midterm, Finals/tentative, and overall final percentages with their grade equivalents. Lecture-only courses show only the configured Lecture component; Lecture + Laboratory courses place both components under each period. Values preserve DentiSYS's configured rounding behavior. |
| X10 | Grade equivalents are calculated using DentiSYS's existing percentage-to-grade conversion and shown beside the corresponding period or overall result; no conversion lookup sheet is exported. |
| X11 | Student number and full name are shown, sorted by last name. No remediation/retention/status columns or signature block. |
| X12 | The Grade Computation workbook is one combined `Grade Sheet` worksheet. Grade-sheet score import is retired; no Faculty import workflow is provided. |
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
| X23 | The Excel matrix header groups are period, component, category, assessment title/max, then Score, %, and Transmuted. The PDF keeps the same period/component/category structure but shows only Score, Average %, Weighted, and period results. |
| X24 | Lecture and Laboratory categories and values share the same continuous matrix under each applicable period. The period and overall grade results are included at the right of the matrix. |
| X25 | Category averages, weighted contributions, component/period results, and grade equivalents come from DentiSys computed values and saved Grade Weights; the exporter does not recalculate them. |
| X26 | Export buttons say "Export Excel" instead of "Export CSV" (tooltips and aria labels too). Class-list exports use the grouped **Export Excel** and **Export PDF** controls. Where a Reports tab offers more than one report, **Export Excel** and **Export PDF** open a menu of that tab's reports; a tab with one report keeps the plain buttons. |
| X27 | **Export PDF** opens a styled, landscape class list with the same header details and roster columns as X15. The browser print dialog lets Faculty save the styled document as PDF, named `<Course>_<Section>_Class_List_<School year>_<Semester>.pdf`. The existing `.xlsx` export and filename in X17 remain available. |
| X28 | **Faculty Reports → Grades & Assessments** exports only the selected `Grades & Assessment Summary` table as one `.xlsx` worksheet or a matching PDF. Both include every row matching active school-year, class, and search filters in the current table sort order, not only the current page. Use the **Class Grade Ledger Report** header with course, section, term, Faculty, student count, and generated date; separate Student No. and Student Name columns; grouped Midterm and Finals component headings when available; and the table values and remarks shown on screen. The PDF includes the Dean seal and Faculty signature. No assessment matrix, retention list, attendance register, or analytics section is included. This export remains separate from the official Grade Computation workbook export.
| X29 | **iBU look.** Every Excel and PDF export uses Bicol University's iBU portal palette, as styling only. Excel: the report-name title row has the navy `#0E436C` fill with white bold text; `BICOL UNIVERSITY` and `COLLEGE OF DENTAL MEDICINE` are bold navy text, the other title lines plain dark `#1E2939` text; column headers are a light-blue `#E1F0FD` row with bold `#075F9D` text. PDF/print: a white header with navy heading text and a 3px navy rule under the header block (readable in black and white), light-blue table header rows with blue text and a `#0776C2` underline, row lines `#F5F5F5`, body text `#1E2939`; text is Inter and headings Sora (CSS font stacks with fallbacks, loaded with the app's Google Fonts link). Applies to the combined official Grade Sheet workbook, the Faculty Reports summary table, class list, Dean reports, Audit Trail and every print view built on `PrintSheet`. The in-app screens do not change. The Excel styles come from one helper in `xlsxDownload.ts`. |
| X30 | **Names and empty values in the plain exports.** Dean Reports (Students, Retention, Attendance), the plain Grade Summary and the plain Faculty Reports Retention and Attendance exports (Excel and PDF) show names as `LAST, First Middle` (`sheetName`) in last-name order (Dean and Faculty Attendance keep their date order first). On-screen tables do not change. A student with no clinic hours shows a dash in the Dean Retention PDF instead of a bare "h". Dean Reports Students and Retention (Excel and PDF) list one row per course enrollment, with a Course Code column after Class and that enrollment's own grade (no fallback to another course or the overall GWA; no grade is `N/A` in Excel and a dash in the PDF); with a class selected or filtered, only that class's enrollments. Student-wide columns (status, face check-in, clinic hours, pending remedials, flagged subjects) repeat on each of the student's rows. The PDF Records line and the Excel filter line give the count as `N students · M course enrollments`. |
| X31 | **Attendance sheet.** Faculty Reports → Attendance → **Export Excel ▾ → Attendance sheet** and **Export PDF ▾ → Attendance sheet**, for the selected class; Dean Reports → Attendance, the same (**Print PDF ▾**), enabled when one class is selected. One class for its whole term. Rows: enrolled students, numbered, `LAST, First Middle`, in last-name order. Columns: every non-revoked session in date order, headed by the date (`Nov 15`), with the opening time added when a date has more than one session (`Nov 15 8:00 AM`). Cells: `P`, `L`, `A`, `E`, or blank while unresolved. Then Present, Late, Absent, Excused and Attendance rate = (Present + Late + Excused) ÷ (Present + Late + Absent + Excused), as a whole percent, blank when nothing is resolved (ATT-006; revoked sessions never count, ATT-001). iBU look (X29) with the usual title rows. File: `<Course>_<Section>_Attendance_Sheet_<School year>_<Semester>.xlsx`. The existing per-date attendance exports stay. |
| X33 | **Grade Computation PDF.** Export PDF prints two landscape pages: Midterm and Finals. Each page includes both Lecture and Laboratory categories for that period. To keep the printout readable, show each assessment's earned Score (with its maximum in the heading), category Average % and Weighted results, and the corresponding grade result and equivalent; omit assessment-level % and Transmuted columns from PDF only. The Finals page also includes the overall final grade and equivalent. Use a full-width layout with aligned columns and repeat matrix headers on continuation pages. The Excel worksheet retains the complete Score, %, and Transmuted matrix. |
