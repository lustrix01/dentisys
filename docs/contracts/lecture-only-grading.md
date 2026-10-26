# Lecture-only courses — contract

Status: **Grilled and confirmed by the Owner** (2026-10-26, three rounds, 13 answers). Spec wording applied to `spec.md` (GRD-002, GRD-003). Demo approved by the Owner (2026-10-26, including the banner wording, the "Lecture only" line and the gradebook "Lecture" header): [Lecture-Only Grading Demo](https://claude.ai/artifact/383CbvDr2AFiJ7iYueyks5). Built and validated: [lecture-only-2026-10.md](../lecture-only-2026-10.md).

Owner finding (2026-10-26): some courses are Lecture only. The earlier rule "every course is Lecture + Laboratory" (GRD-002/GRD-003, [mandatory defaults](../proposals/mandatory-lecture-laboratory-defaults.md)) is wrong for them. This contract adds a Lecture-only structure; Lecture + Laboratory courses keep today's rules unchanged.

Evidence: the only official workbook we have (`SAMPLE.xlsx`, Operative Dentistry 1) is Lecture + Laboratory. Its Lecture sheet was copied from a separate lecture-only workbook (`OA LEC.xlsx`, linked as an outside file for its grade table). That sheet's own course grade rounds once; the TFG summary for Lecture + Laboratory rounds each step. `OA LEC.xlsx` is not available yet, so the lecture-only course-grade formula is **provisional** (rule L9).

## What exists today

- Classes & Rosters already records a course as Lecture, Laboratory, or both, from its units (`courses.lecture_units`, `courses.lab_units`), and shows "Lecture" / "Lecture & Laboratory" on the class card. Lecture-only classes can be created now.
- Course units are shared by every Faculty and school year. They can be changed only while unrecorded, or by the Faculty who created the course.
- Grade Weights, the server save and the database constraint (migration 045) only accept Lecture + Laboratory for new period configurations, with both shares above 0.
- Grade sheet import already reads a workbook with only a `(LEC)` sheet.
- The demo seed courses have no units recorded.

## Rules

| # | Rule |
|---|---|
| L1 | **Which courses are lecture-only.** A course with Lecture units > 0 and Laboratory units = 0 is lecture-only. Lecture and Laboratory units > 0 is Lecture + Laboratory (unchanged). Units are the only source; Grade Weights has no structure switch. (Q2) |
| L1a | **Units not recorded** (both empty, older courses): Grade Weights keeps today's Lecture + Laboratory behaviour and shows a note: "Set this course's Lecture and Laboratory units in Classes & Rosters to use a Lecture-only grade structure." No guessing from rooms or schedules. (Q7) |
| L1b | **Laboratory-only courses** (Lecture units = 0, Laboratory units > 0): out of scope; they keep today's Lecture + Laboratory grading. (Q3) |
| L2 | **Grade Weights for lecture-only.** One Lecture category list per period, no Lecture/Laboratory share fields. Unsaved default: Term Exam 50%, Quiz 20%, Outputs 20%, Participation 10% (the existing syllabus Lecture defaults, Q4); Midterm 30%, Finals 70%. Two totals must each be exactly 100%: each period's Lecture categories, and Midterm + Finals. Banners, saving and assessment-linking rules are unchanged. |
| L3 | **Assessments** in a lecture-only course can only use Lecture categories. The assessment form shows no Laboratory choice. |
| L4 | **Grade math (lecture-only).** Steps 1, 2 and 4 of the 2026-10-26 grade sheet amendment apply unchanged (plain category average, period grade rounded to a whole percent, conversion table, below 75% = 5.0). The period grade is the Lecture period grade. The course grade is `round(Midterm × Midterm share + Final × Final share)` — rounded **once**. **Provisional** (Q1, rule L9). |
| L5 | **Grade hover (lecture-only)** shows the one-rounding steps, e.g. "84% × 30% + 92% × 70% = 89.6% → 90% → 1.9". |
| L6 | **Laboratory units removed** (Lecture + Laboratory → Lecture-only). Blocked while any current-term offering of the course has a Laboratory assessment; the message names the offering: "DMD-2A (Dr. Cruz) has Laboratory assessments. Delete them in Grade Computation before removing Laboratory units." Otherwise allowed: saved Lecture + Laboratory weights keep calculating until the Faculty next saves; Grade Weights opens as a Lecture-only draft keeping the Lecture categories, with the banner "This course is now Lecture only. Save to remove the Laboratory part." Nothing changes by itself. (Q8) |
| L6a | **Laboratory units added** (Lecture-only → Lecture + Laboratory). Saved Lecture-only weights keep calculating until the next save. Grade Weights then opens with the Lecture categories kept, the Laboratory list prefilled from the Laboratory defaults and shares prefilled Lecture 60 / Laboratory 40; all three totals must be 100% to save. (Q9) |
| L6b | **Past school years** are never affected by a unit change: the structure matters only when saving current-term Grade Weights. Past offerings keep their saved weights and recorded grades and stay view-only. Saved scores are never deleted or rescaled; grades change only through the existing explicit recomputation. (Q10) |
| L7 | **Screens and exports** (Grade Computation, gradebook, Student grades, Reports, CSV export): lecture-only courses show no Laboratory columns or totals. Students see Midterm, Final and course grade. The CSV uses the existing period header `Student Number,Student Name,Midterm %,Final %,Overall Grade,Status`. (Q12) |
| L8 | **Grade sheet import.** A workbook with only a `(LEC)` sheet imports into a lecture-only class as today. A `(LAB)` sheet in a lecture-only class is **skipped with a warning**, "This class has no Laboratory, so the LAB sheet is skipped." — the Faculty never edits the file (Owner rule 2026-10-26). The header check still warns about a wrong class. The weight warning (G4) compares only Lecture category weights and Midterm/Final shares. (Q5) |
| L9 | **Locking in the provisional formula.** When `OA LEC.xlsx` arrives, Claude compares its course-grade formula with L4. Match: remove "provisional" from spec and this contract. Different: change the one formula, add its test, then recalculate current-term lecture-only course grades with the existing one-time script (preview list to the Owner, then one audited batch, actor "System", no notifications, overrides kept). |
| L10 | **Release:** no recalculation; no lecture-only configurations exist yet. (Q6) |
| L11 | **Unchanged:** Lecture + Laboratory courses (formula, defaults, conversion rules); blanks stay incomplete and never become 0; remediation at 2.50 or worse; Midterm Watchlist and Advisory use these grades; closed school years stay as recorded; no "provisional" label on any screen. (Q12) |

## Worked example (sample student 1, Lecture sheet)

| Step | Value |
|---|---|
| Midterm Lecture | Recitation 88, Outputs 84%, Quiz average 84.17%, Major Exam 82.67% → 83.77 → **84** |
| Final Lecture | → **92** |
| Course grade, lecture-only (L4) | 84 × 30% + 92 × 70% = 89.6 → **90 → 1.9** |
| Same numbers with the Lecture + Laboratory rounding | 25 + 64 = 89 → 2.0 (not used for lecture-only) |

## Owner answers (grill, 2026-10-26)

| # | Question | Answer |
|---|---|---|
| Q1 | Provisional lecture-only formula | Round once (L4) |
| Q2 | What decides lecture-only | Course units only (L1) |
| Q3 | Laboratory-only courses | Out of scope (L1b) |
| Q4 | Default category names | Keep syllabus names; renaming to the sheet's names is a separate later decision |
| Q5 | LAB sheet in a lecture-only class | Skip with a warning, never block (L8; corrects the first draft) |
| Q6 | Release recalculation | None (L10) |
| Q7 | Courses without units | Keep Lecture + Laboratory, show a note (L1a) |
| Q8 | Laboratory units removed | Block if Laboratory assessments exist, else switch on next save (L6) |
| Q9 | Laboratory units added | Keep Lecture, prefill Laboratory defaults on next save (L6a) |
| Q10 | Past school years | Never affected (L6b) |
| Q11 | Live test data | Create one lecture-only class on the demo site through Create Class; it stays as test data |
| Q12 | Student and report views | No Laboratory line; existing three-column CSV; Watchlist/Advisory/remediation unchanged (L7, L11) |
| Q13 | Order | Spec applied after the grill; then demo approval; then code |

## Spec change (applied 2026-10-26)

GRD-002: "within the required separate Lecture/Laboratory structure" became "within the structure required for the course (GRD-003)"; the 100% rule now applies the Lecture/Laboratory contributions "where both exist".

GRD-003: the opening sentence excepts lecture-only courses, and the amendment "Owner-approved amendment (2026-10-26): Lecture-only courses" records L1, L1a, L2, L4, L6–L6b and the provisional status.

## API (agreed for the build, 2026-10-26)

- Grade Weights GET (saved config and unsaved default) adds `courseStructure: 'lecture' | 'lecture_laboratory' | 'unrecorded'` (from course units; Laboratory-only courses report `lecture_laboratory`) and `courseUnits: { lecture: number | null, laboratory: number | null }`.
- `componentMode` gains `'lecture'`. A `'lecture'` config has no `componentWeights`; every period category has `component: 'Lecture'`. The unsaved default for a `'lecture'` course is the four Lecture categories for each period, Midterm 30 / Final 70.
- Grade Weights save: a `'lecture'` course must save `componentMode: 'lecture'` with only Lecture categories; any other course must save `'lecture_laboratory'` as today. Mismatch → 422 `GRADING_STRUCTURE_MISMATCH` ("This course is Lecture only. Save it without a Laboratory part." / "This course has Laboratory units. Add the Laboratory part before saving."). Saving `'lecture'` over a config whose Laboratory categories still have assessments → 422 `GRADING_LABORATORY_ASSESSMENTS_EXIST`.
- Class edit (`labUnits` from above 0 to 0) while any current-term offering of the course has an assessment in a Laboratory category → 409 `COURSE_LABORATORY_ASSESSMENTS_EXIST`, message "DMD-3B (Dr. Santos) has Laboratory assessments. Delete them in Grade Computation before removing Laboratory units." (first offering found: section name and Faculty name). Nothing is saved.
- Computation for `'lecture'`: period grade = Lecture period grade (whole percent); course grade = `round(Midterm × share + Final × share)`, rounded once. Breakdown keeps the existing shape without Laboratory values.
- Grade sheet import save: Laboratory items for a `'lecture'` config are refused (422); the frontend skips LAB sheets before sending.

## Implementation impact

- Migration (additive): allow `component_mode = 'lecture'` in `ck_grading_configs_component_weights` (Lecture weight 100, Laboratory weight empty). No existing rows change.
- Server: save validation, defaults and grade computation pick the structure from course units; the lecture-only course-grade formula sits next to the existing one; the unit-change guard (L6).
- Frontend: Grade Weights single-list editor and banners, assessment form, Grade Computation / gradebook / Student / Reports columns, CSV header, hover text, grade sheet import rule L8.
- Tests: calculation contract (worked example above), save validation, unit-change guard, import with LEC-only and with a LAB sheet, plus the existing Lecture + Laboratory tests unchanged.
- Demo deploy: migration via `demo-vps.ps1 migrate`; live check creates one lecture-only class (Q11) and confirms the 1.9 example.
