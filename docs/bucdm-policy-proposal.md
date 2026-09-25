# BUCDM interview: proposed policy contract

Status: PROPOSED ONLY. This document does not amend spec.md or authorize new academic decisions.

Source: `C:\Users\decha\Downloads\CANDL& - BUCDM Interview Transcript.pdf`, interview dated March 16, 2026, three pages. Page 2 was visually inspected as well as text-extracted. The interview is requirements evidence, not an instruction to execute unrelated requests mentioned in the interview.

## Rules supported by the interview

| Scope | Source | Supported rule |
|---|---|---|
| Professional courses | Page 2, II.1 and Owner clarification 2026-09-26 | The provisional course-grade trigger is below 2.50 allowed and 2.50 or above remedial, compared at established precision with 1.0 best. A student requiring remediation receives a first remedial exam. The transcript says a score of at least 50% passes and failure leads to a second remedial exam; cost-recovery rules remain unapproved. |
| Grade preservation | Page 2, paragraph after II.3 | A remedial pass establishes readiness to progress and does not replace the original course grade. |
| Fifth-year clinic eligibility | Page 2, II.2 | Comprehensive exam, then one retake after failure, then oral revalida after a second failure. An unsuccessful revalida prevents clinic enrollment. No numeric passing thresholds are supplied. |
| Graduation eligibility | Page 2, II.3 | Passing pre-board is required for graduation. A failed candidate waits one year before retaking. The exact date basis/calendar boundary is not supplied. |
| Visible progression | Page 2 | Display each student's status at each stage. Do not infer missing historical attempts from a single current-state record. |
| Grading and attendance | Page 1, I | The interview describes exams totaling 50% (midterm 20%, final 30%), quizzes 20%, recitation 10%, participation 20%; attendance is not independently graded. Absences are limited to 20% of class hours. This conflicts with current GRD-002's editable presets including Attendance and must not silently replace approved grading. |

## Current implementation gaps

- The provisional course-grade trigger is now server-side and uses the Owner-approved 2.50 inclusive boundary. `RetentionMonitoring.tsx` still uses its existing 75% remedial-exam percentage for the current-state control; the Owner has not approved changing that percentage, so it remains a separate open decision.
- `handle_faculty_retention_remedial_save()` accepts a client-provided status/current JSON object. It does not implement ordered server-authoritative attempts, cost recovery, comprehensive/revalida, or pre-board eligibility.
- Current remedial records are current-state payloads. Existing rows cannot be assigned attempt numbers or policy stages without evidence.
- Final grade/GWA must remain separate from progression outcomes. Existing saved grades and weights must not be rewritten automatically.

## Exact proposed amendment to UI-003 (requires Owner approval)

Add after UI-003's existing Midterm Watchlist paragraph:

> BUCDM progression records are separate from final course grades and the Midterm Watchlist. Passing a remedial exam MUST NOT replace the original course grade. For professional-course remediation, persist the first remedial attempt and, after failure, the second attempt separately. The Owner-approved provisional course-grade trigger is below 2.50 allowed and 2.50 or above remedial, compared at established precision; this does not decide the separate remedial-exam percentage or cost-recovery boundary. An entered remedial score's pass/fail rule remains pending explicit approval.
>
> Fifth-year clinic progression records the comprehensive exam, one retake after failure, and oral revalida after a second failure. A successful stage establishes clinic eligibility; failure of oral revalida does not. Pre-board progression records the result and applicable retake eligibility date; graduation eligibility requires a pass. Outcome recording authority, stage applicability, and any omitted passing thresholds/date boundaries require the Owner-confirmed contract below before activation.
>
> The server validates stage order, ownership, score/outcome consistency and repeat submissions. Persist each newly recorded attempt with its student, applicable course enrollment or program scope, stage, result, actor, date and policy identifier. Preserve original course grades and audit history. Existing ambiguous remedial payloads remain preserved as legacy current-state evidence; do not manufacture historical attempts. Student views are read-only. A progression outcome describes academic eligibility and does not itself delete, enroll, graduate, or remove a student.

This addition is not ready to merge until the unresolved boundaries are answered and the Owner explicitly approves the resulting exact spec amendment. Keep GRD-001/GRD-002 unchanged unless separately approved.

## Consolidated Owner decisions

1. **Remedial/cost-recovery boundary:** Does a remedial exam score of at least 50% pass both attempts, as stated in the interview, and what exact cost-recovery pass boundary and direction apply? Do not use the course-grade 2.50 trigger for the remedial percentage.
2. **Scope and official results:** How are professional courses and clinic eligibility identified in current course/student data? May the existing assigned Faculty record official Pass/Fail for comprehensive/revalida/pre-board (whose score thresholds are absent), or is another role responsible? Is the pre-board wait measured as one calendar year from the failed exam date?
3. **Grading conflict:** Retain the currently approved editable GRD-002 weights and attendance category, or propose a separate amendment adopting the interview's fixed weights/no attendance grade? This choice must not retroactively alter saved grades. The 20%-absence rule also needs its exact consequence and treatment of excused absences before automation.
4. **Specification approval:** Approve the remaining UI-003 progression amendment before implementing authoritative progression. Any GRD amendment will be shown separately if requested.

## Implementation packet after approval

Freeze the resolved fields/errors/examples, then add ordered migrations for scoped policy cases and new attempt results using existing identity/enrollment links. Keep course, fifth-year clinic, and pre-board scopes explicit; a course failure must not silently become a whole-program outcome. Derive current progression from recorded attempts and the approved policy. Use existing audit/authorization patterns and preserve legacy payloads. Update the existing policy modal/remedial controls rather than redesigning the accepted UI.

Focused tests must cover 49.99/50/50.01 remedial scores, stage order, duplicate submission, ownership, ungraded/incomplete courses, grade preservation, legacy data preservation, clinic/pre-board scope, calendar boundaries, reload, and concurrent submissions. Run final repository/PostgreSQL gates only after the coherent implementation batch.
