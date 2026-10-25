# Official class list and grade sheet imports — contract

Status: **Grilled and demo approved** (2026-10-26, three rounds). Scope: imports plus the new grade math; exports are a separate, later feature. Demo: [Official Imports Demo](https://claude.ai/artifact/2qfYUM9W8C5xL5PnGWTuBm).

Owner rule (2026-10-26): Faculty upload the school's files exactly as the school gives them. DentiSys adapts to the layout; it never asks Faculty to change a file.

Sample files (kept outside the repo, they hold real student data): four "Official List of Enrolled Students" PDFs (DMD-1A, 2A, 3A, 4A) and one grade sheet workbook (`SAMPLE.xlsx`, Operative Dentistry 1, 2nd Sem AY 2025-2026). Tests use made-up rows in the same layout.

## 1. Official class list PDF (roster import)

Where: Classes & Rosters → Import roster (existing screen). CSV import stays as it is.

### Layout (as given)

- Header: Course Code, Course Title, Class Section, Year Level, Academic/Lab/Credit Units, Lab Hours, Faculty, Schedules, "AY 2026-2027 1st Semester".
- Table: `# | Student No. | Program | Name | Gender | Year Level | Contact #`. The Name cell has two lines: `Last, First Middle` and the university email, or the text `No University Email`.
- Last page may hold only `Total Number of Students: N` and `*** NOTHING FOLLOWS ***`.
- Student No. comes in two shapes: `2026-01-10229` and `2022-7003-68276`. Both are kept exactly.

### Rules

| # | Rule | Today |
|---|---|---|
| P1 | The Program column (`DMD`) is read and ignored. It never becomes part of the name. | Bug: "DMD" is added to every first name |
| P2 | A page with no table is allowed when it holds the total line or "NOTHING FOLLOWS". Any other page with no table still stops the import with the page number. | Bug: DMD-4A fails on page 3 |
| P3 | The number of rows read must equal `Total Number of Students`. If not, an amber warning names both numbers; the Faculty may still save (Owner, 2026-10-26). | Not checked |
| P4 | `No University Email` means the email is missing: the row is blocked until the Faculty types a valid institutional email (IMP-001). The text never becomes part of the name. | Bug: text goes into the name |
| P5 | The header's Course Code, Class Section, school year and semester are compared with the class the Faculty picked. A difference shows a warning listing each field (file vs class). The Faculty may still continue. Nothing is created or changed from the header. | Not checked |
| P6 | The "Official format not confirmed" label is removed for this PDF layout. It stays on the CSV template. | Label shown |
| P7 | Unchanged: preview and class confirmation before saving, crossed-out row detection, name review, existing-Student matching by server identity, no email overwrite, invitations separate, file processed in the browser only. | — |

Example warning (P5), using the files as named:

> This file is for **DM 102 · DMD 2 · AY 2025-2026 1st Semester**. You picked **DM 100 · DMD-1A · AY 2026-2027 1st Semester**. Check you chose the right file.

## 2. Official grade sheet workbook (score import)

Where: Grade Computation → Import Grade Sheets (existing tab; today it previews a simple CSV and cannot save).

### Layout (as given)

- One sheet per component, found by its title row, not by sheet name (sheet names vary: "Sheet2", "dental"):
  - title row 4: `OPERATIVE DENTISTRY 1 (LEC)` or `(LAB)`; row 5: `2ND SEMESTER, AY 2025-2026`.
  - A course without a laboratory has only the lecture sheet.
- Row 7: column headers. Left half is Midterm (ends at `MIDTERM GRADE`), right half is Finals (ends at `FINAL GRADE`).
- Each category is a header followed by its weight (`RECITATION 0.1`, `OUTPUTS … TOTAL 0.2`, `QUIZ 1…QUIZ 5 … QUIZ AVE. 0.2`, `MAJOR EXAM 0.5`; lab: `LAB PERFORMANCE`, `LAB EXERCISES`, `QUIZ`, `PRACTICAL EXAM`).
- Row 9: maximum points of each item. `0` means the item is not used.
- Rows 10+: `No. | Names | raw scores …`, then computed columns (`%`, TOTAL, AVE., grade, EQUIV.).
- A summary sheet (`TFG`: Lec 60% + Lab 40%, Midterm 30% + Final 70%) and a `DATA` grade table are present.

### Rules

| # | Rule |
|---|---|
| G1 | Only raw scores are imported: one score per student per used item (max > 0). `RECITATION` and `LAB PERFORMANCE` have no max: they are read as a percentage out of 100. Computed columns, the summary sheet and `DATA` are never imported. DentiSys computes grades with its own rules (GRD-001/002, BUCDM conversion). |
| G2 | Each used item maps to one DentiSys assessment in the matching period, component and category, matched by title (e.g. "Quiz 1"). If it does not exist yet, the preview lists it as "New in the sheet" (title from the header, max from row 9, transmutation 50–100% as the sheet does). Each one is created only if the Faculty ticks it and confirms. Nothing is created automatically. |
| G2a | An assessment that exists in DentiSys for that period and component but is not in the sheet is listed as "Not in the sheet". Default: keep. The Faculty may tick it for removal; the confirmation names each one and how many saved scores it holds ("Quiz 4 (Midterm) · 38 saved scores will be deleted"). Removal uses the existing assessment delete (its permissions, audit and grade recomputation). Unticked ones stay unchanged. |
| G2b | When the item max in row 9 differs from the existing assessment's max, the preview shows `old max → sheet max` and blocks that item until the Faculty chooses: keep the DentiSys max (scores above it stay blocked) or update the max (existing assessment edit rules apply). |
| G2c | Items without their own name in the sheet are named by position: "Outputs 1, 2…", "Lab Exercise 1, 2…". Every sheet item has a choice: **Create new** or **Use existing: [DentiSys assessment of that period and component]**, so a differently named assessment can be linked instead of duplicated. (Owner, 2026-10-26) |
| G2d | An item with a max in row 9 but no scores yet is listed as "No scores yet" and is not ticked for creation by default. (Owner, 2026-10-26) |
| G2f | One "Create all N new items that have scores" tick above the list ticks every new item with scores at once; items without scores stay unticked (G2d) and each item can still be changed. (Owner, 2026-10-26) |
| G2e | Lowering a max below a score already saved is refused, as assessment edit does today ("Maximum score cannot be lower than a score already saved…"). |
| G12 | Only the Faculty assigned to the class may import, and only for current school-year classes; past or archived classes refuse, as score entry does today. (Owner, 2026-10-26) |
| G13 | One "Import scores" save does everything (create, link, remove, max changes, scores) in one transaction: all or nothing. Every changed record gets its own audit row with one shared batch ID (audit R12), shown as one expandable row, e.g. "Imported grade sheet · 41 items · DM 116 DMD-3A". (Owner, 2026-10-26) |
| G14 | `RECITATION` and `LAB PERFORMANCE` become one assessment per period and component, max 100, transmutation off (88 stays 88%). (Owner, 2026-10-26) |
| G15 | A sheet is Lecture or Laboratory by its title row ("(LEC)"/"(LAB)"). Without either, the Faculty picks one in the preview. Sheets with no score table are ignored. (Owner, 2026-10-26) |
| G17 | One `.xlsx` up to 10 MB at a time, read in the browser only. A password-protected workbook gets "Remove the password in Excel, then upload again." (Owner, 2026-10-26) |
| G16 | A student picked for a sheet name is reused for the same name on the other sheet. (Owner, 2026-10-26) |
| G3 | Category names in the sheet are matched to the saved Grade Weights categories by name. An unmatched category blocks its items until the Faculty picks a category. |
| G4 | If the sheet's weights (0.1, 0.2, 0.5, Lec 60/Lab 40, Midterm 30/Final 70) differ from the saved Grade Weights, a warning shows both. Import never changes Grade Weights. |
| G5 | Students are matched by the Names column against the class roster (same name normalisation as roster import). One exact match = matched. No match or more than one = blocked until the Faculty picks the Student or excludes the row. Row numbers are never used to match. |
| G6 | A blank score cell is not imported: the score stays missing and the grade stays incomplete (spec: missing never becomes zero). The preview counts blanks per item. |
| G7 | A score above the item max, below 0, or not a number blocks that cell. Excel errors (`#DIV/0!`) in computed columns are ignored. |
| G8 | A score that differs from one already saved shows `old → new` and is not saved unless the Faculty ticks it. Equal scores are skipped silently. |
| G9 | Title and semester rows are compared with the selected class (as P5). A difference warns; the Faculty may continue. |
| G10 | Saving uses the existing score batch save (`POST /faculty/scores`, as Full Matrix View): with its existing validation and audit rules (to be confirmed during implementation: all-or-nothing save and one audit batch). The file is read in the browser and never uploaded. |
| G11 | Accepted file: `.xlsx`. The current `Student ID, Score` CSV import is replaced by this. |

### Known differences between the sheet and DentiSys (no change proposed)

The sheet's own grade may differ from DentiSys's. These follow `spec.md` and are not changed by this contract:
- Midterm below 75%: sheet 5.0; spec (2026-10-17) 3.1–4.0.
- Rounding: sheet rounds to a whole percent (74.6 → 75 → 3.0); spec rounds to 2 decimals then truncates (74.6 → 74).
- Blank scores: the sheet counts them as 0 (grade 50% → 5.0); DentiSys leaves the grade incomplete.

## 3. Open questions (recommendation first)

1. **Names in real sheets.** Answered (2026-10-26): real sheets have names; the sample was emptied for privacy. Name format unknown, so G5 accepts `Last, First Middle`, `Last, First M.`, `First Middle Last` and any letter case, and flags every row that does not match exactly one Student.
2. **Sheet grade vs DentiSys grade.** Owner (2026-10-26): the sheet is closer to the truth; explore options before deciding. See section 3a. Open.
3. **Missing and extra assessments.** Answered (2026-10-26): agreed G2, G2a, G2b; needs a demo.
4. **File type.** Answered (2026-10-26): `.xlsx` only; a `.xls` file gets a clear message.
5. **New library.** Answered (2026-10-26): approved, one small `.xlsx` reader, frontend only.

## 3a. How the sheet calculates vs DentiSys (for question 2)

Worked on sample student 1, Midterm Lecture: Recitation 88, Outputs 34/50, Quiz 1 14/20, Quiz 2 20/30, Major Exam 49/75.

| Step | Sheet | DentiSys today |
|---|---|---|
| Items inside a category | Plain average of item % (Quiz 1 85%, Quiz 2 83.33% → 84.17%) | Weighted by max points (→ 84.00%) |
| Period result | 83.77 → rounded to whole: **84 → 2.5** | 83.73 → truncated: **83 → 2.6** |
| Midterm below 75% | 5.0 | 3.1–4.0 (spec 2026-10-17) |
| Blank score | Counts as 0 | Grade stays incomplete |
| Intermediate rounding | Lab sheet rounds "Midterm 30%" to a whole number; the Lecture sheet does not. Summary sheet rounds each step. | Unrounded until the end |

Note: the Lecture and Laboratory sheets of the same file round differently, so this may be one Faculty's template, not a college rule.

Options:
- **A. Match the sheet completely**, blanks as 0 included. Grades would equal the sheet. Risk: a score not yet entered silently becomes a failing grade, and remediation flags appear early.
- **B. Match the sheet's math, keep blanks as incomplete (recommended).** Plain average inside categories, whole-number rounding, the sheet's conversion table, the same intermediate rounding. Missing scores still show "incomplete" instead of failing.
- **C. Save the sheet's own grades** as the official grade, next to DentiSys's. Two sources of truth that can disagree; scores entered later in DentiSys would not change the grade.
- **D. Keep DentiSys's rules**, only show the difference in the preview.

Any of A–C changes GRD-002 and the 2026-10-17/2026-10-22 amendments, and applies to every class, not only imports.

**Owner decision (2026-10-26): Option B.** The sheet is the Dean's official calculation for every Faculty. Blanks stay incomplete. Exact wording to approve is in section 4b.

**Owner decision (2026-10-26): lecture-only courses are a future iteration.** DentiSys has none today: GRD-002/GRD-003 require positive Lecture and Laboratory contributions. The course grade follows the summary (TFG) sheet: `round(round(Midterm × 30%) + round(Final × 70%))`. Note for later: the workbook's Lecture tab rounds once instead (`round(Midterm × 30% + Final × 70%)`; sample student 1: 89.6 → 90 → 1.9 vs 25 + 64 = 89 → 2.0). Ask the Dean which is right before lecture-only courses are added.

## 4. Spec change (needs Owner approval before it is applied)

Replace in IMP-001 the sentences "The interface MUST state "Official format not confirmed"; a sample does not establish official Registrar compatibility." and "Official Registrar compatibility and grade-sheet importing remain unconfirmed." with:

> Owner decision (2026-10-26): The BU College of Dental Medicine "Official List of Enrolled Students" PDF and the official grade sheet workbook (.xlsx) are the official import layouts. Faculty upload them unchanged; DentiSys adapts to them. The CSV template stays provisional and keeps the "Official format not confirmed" label. Grade sheet import saves raw scores only, never computed grades, through the existing score rules; it never changes Grade Weights, never turns a blank into zero, and never overwrites a saved score without the Faculty's confirmation. File headers are checked against the selected class and differences are warnings.

## 4b. Grading spec change for option B (needs Owner approval before it is applied)

Add to section 9 after the 2026-10-22 amendment:

> Owner-approved amendment (2026-10-26): Official BUCDM grade sheet calculation. The Dean's official grade sheet is the calculation authority for every Faculty. For current-term grades it replaces the exact-value rule of 2026-10-12, the truncation and Midterm below-75% rule of 2026-10-17, and the rounding rule of 2026-10-22.
> 1. A category percentage is the plain average of its assessments' effective percentages (GRD-001 transmutation applies per assessment). Maximum points do not weight the average.
> 2. A component's period grade is the weighted sum of its category percentages, rounded to a whole percent (.5 rounds up).
> 3. With Lecture and Laboratory, a period grade is round(Lecture period grade × Lecture share + Laboratory period grade × Laboratory share), and the course grade is round(round(Midterm × Midterm share) + round(Final × Final share)).
> 4. A whole percent converts with the 2026-10-17 table (99–100 = 1.0 … 75 = 3.0). Below 75% is 5.0 for Midterm, Final and course grades.
> 6. Hovering, focusing or tapping a grade shows its steps, e.g. "83.77% → 84% → 2.5". This replaces the 2026-10-12 hover sentence.
> 7. Unchanged: a missing score keeps the dependent grade incomplete and never becomes zero; the remediation trigger is 2.50 or worse (84% or below); the Midterm Watchlist and Advisory use these grades; grades saved in closed school years stay as recorded.

**Approved by the Owner on 2026-10-26 (grill round 1): sections 4 and 4b as written.** Correction (Owner, 2026-10-26): the risk-level rule was removed; risk levels were retired on 2026-10-17. Applied to `spec.md` when the grill ends, together with any wording later rounds add.

## 4c. Grades already saved (Owner, 2026-10-26)

At release, every current-term course grade is recalculated once with the 4b rules, as one audited batch. Before production, Claude shows the Owner the list of grades that change on the demo site.

How (Owner, 2026-10-26): a one-time script with `preview` (lists changes, writes nothing) and `apply` (one batch, actor "System"). On demo, Claude runs preview, shows the list, then apply. For production, `promote-prod.ps1` runs it right after deploy, so the Owner still runs one command.

Side effects (Owner, 2026-10-26): this one-time recalculation keeps manual retention overrides and sends no student notifications; the preview list marks students who have an override. Ordinary score saves keep today's behaviour.

Grade hover (Owner, 2026-10-26): hovering, focusing or tapping a grade shows the steps, e.g. "83.77% → 84% → 2.5", instead of "Exact: 2.53 (83.73%)".

## 5. Next steps

1. Owner runs `/grill-me` on this draft and answers section 3.
2. Claude builds a Before/After demo of both preview screens.
3. Owner approves contract, spec change and demo.
4. Implementation by subagents, tests with made-up files, `./scripts/check.ps1`.
