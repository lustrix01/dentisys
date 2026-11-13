# Grade Clarification — Implementation Handoff Draft

**Historical handoff draft; not a specification amendment.** This document captured the code and open gaps before the 2026-11-13 implementation. Its references to current behavior and implementation gaps are a historical snapshot, not a report of the present working tree. The clarified requirements are implemented in `345b328`; `check.ps1` and `check-postgres.ps1` passed on that commit (2026-11-13). See [spec.md](../../spec.md) for current approved behavior and [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) for delivery status. The workbook is a calculation reference, not an instruction to copy its course weights or blank-score behavior.

## Confirmed answers — no colleague question needed

### Course setup and grade calculation

- **Categories and weights:** Courses may use different categories. Faculty create and configure these in Grade Weights; there is no need to collect a category list for every course from colleagues.
- **Course structure:** DentiSys already supports Lecture-only and Lecture + Laboratory. Course units determine which structure Grade Weights uses.
- **Assessment formula:** When transmutation is on, calculate `(score ÷ maximum possible score) × 50 + 50`. A 10/20 becomes 75%; 15/20 becomes 87.5%. Some assessments may leave transmutation off.
- **Attendance link:** When transmutation is on, an unlinked assessment is transmuted directly. A linked assessment checks attendance first: Present, Late, and Excused use the formula, Absent is 0%, and unresolved attendance leaves the assessment incomplete. The current implementation already follows this behavior.
- **Missing scores:** Every active assessment with a blank score keeps the dependent grade incomplete. DentiSys already does this. Do not copy the workbook’s blank-to-50 behavior.
- **Category average:** Assessment percentages in a category are averaged equally, then the saved category weight is applied. The category weights are editable.
- **Weights:** The current defaults are Lecture 60% / Laboratory 40% and Midterm 50% / Final 50%. Faculty can save different weights. These configurable defaults are sufficient; the workbook’s specific splits do not replace them.
- **Rounding:** Keep the current staged rounding. DentiSys preserves assessment and category-average decimals, rounds component-period results, rounds the Lecture/Laboratory period combination, then rounds weighted Midterm and Final contributions. Lecture-only uses its separate single-rounding course formula. The Owner confirmed this existing rounding behavior is intended.
- **Grade conversion:** DentiSys uses the BUCDM table: 99–100 = 1.0, 84 = 2.5, 75 = 3.0, and below 75 = 5.0, with the intervening bands in the grade table. A Midterm below 75 may display as 5.0 but does not itself trigger remedial.
- **Reports percentage:** The Owner confirmed the Reports bundle should show the effective, transmuted percentage.

### Remedial behavior

- **When it can be assigned:** Remedial is course-level and requires a completed final course grade. A Midterm result alone or an incomplete course grade cannot trigger it.
- **Course coverage:** The Owner says remedial applies to every course. The API supports this, although some Grade Computation retention remarks are currently displayed only for clinical courses.
- **Trigger:** 2.4 is the last passing grade; a completed final course grade of 2.5 or worse triggers remedial, except 5.0. A student who receives 5.0 must re-enroll in person as an irregular; DentiSys does not handle that enrollment. Grade equivalents are one decimal (2.0, not 2.00).
- **Midterm notice:** A complete Midterm grade of 2.5 or worse can place the Student on the Midterm Watchlist/Advisory. It is an early notice, not course remedial. A Midterm email advisory is Faculty-initiated; the system does not send that email automatically.
- **Current implementation:** The server triggers remedial for every final grade of 2.5 or worse, including 5.0. It does not represent irregular status.
- **Attempts and passing:** The system allows at most two attempts. The server currently passes a raw remedial score of 50% or higher; the Owner’s stated expectation is 75% or higher. A score below 75% fails; failing the first attempt allows a retake, and failing the retake moves to cost recovery.
- **Original grade:** Passing remedial does not replace or change the original course grade.
- **After failures:** Failing attempt one makes attempt two available. Failing attempt two automatically moves the progression to `cost_recovery_required`; there is no third remedial attempt.
- **Cost-recovery screen and API:** After both attempts fail, the progression automatically becomes `cost_recovery_required`; a separate Faculty modal records a cost-recovery final grade from 1.0 to 5.0. Intended precision is one decimal place. A grade of 2.4 passes; a worse grade above 2.4 (such as 2.5) fails. Current code accepts two decimal places and passes all grades below 2.50, so it incorrectly passes 2.41–2.49. A recorded result cannot be changed, and the original course grade stays unchanged. A failed cost-recovery result is stored as `cost_recovery_failed` with its entered grade; it is distinct from a 5.0 final course grade, which means irregular re-enrollment. DentiSys records the status and grade outcome; it does not manage the actual cost-recovery program or its academic activities.
- **Recorded details:** Each attempt stores its number, scheduled date, score, result, Faculty actor, and optional notes.

## Gaps identified before the 2026-11-13 implementation

The gaps listed in this historical handoff were addressed by the 2026-11-13 changes (`345b328`). Container and PostgreSQL validation passed on that commit.

- Replace the remedial-attempt pass threshold of 50% with the Owner-stated 75% raw-score threshold.
- Exclude a 5.0 from the 2.50-or-worse remedial trigger. The student re-enrolls in person as an irregular; that process remains outside DentiSys.
- Make Grade Computation retention remarks consistent with the all-course remedial rule.
- Remove editable transmutation minimum/maximum fields; retain only the per-assessment transmutation on/off toggle with a fixed 50% minimum formula.
- Change cost-recovery grade input to one-decimal precision and apply the confirmed boundary: 2.4 passes; grades worse than 2.4 fail. Preserve the entered cost-recovery grade and its failed status separately from a 5.0 final course grade.
