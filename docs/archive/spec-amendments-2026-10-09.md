# Approved specification amendment: blended percentage-to-grade conversion

Owner approval: 2026-10-09. The Owner chose "Adopt blended grades for now, we
will ask the college for further confirmation", required that rounding never
create a remediation flag ("we need this to be accurate, we don't need false
flags"), chose to decide the trigger on the exact value, and approved the exact
text below with "Yes".

The decision is provisional until BUCDM confirms the official scale. It replaces
the stepped percentage-to-grade table that commit 3813cc6 (branch `owhie7`)
had already switched to interpolation without approval.

## Inserted in UI-003

> Owner decision (2026-10-09, provisional pending BUCDM confirmation): A
> percentage converts to the 1.00–5.00 grade by linear interpolation between
> 97% = 1.00, 94% = 1.25, 91% = 1.50, 88% = 1.75, 85% = 2.00, 82% = 2.25,
> 80% = 2.50, 78% = 2.75 and 75% = 3.00. 97% or more is 1.00; below 75% is 5.00.
> Server and client use the same conversion. Grades are stored and displayed
> rounded to two decimals, but the 2.50 remediation trigger and risk levels
> compare the exact unrounded grade, so rounding never creates a remediation
> flag. Only 80.00% or below reaches 2.50.

## Changed in the 2026-09-29 risk-levels decision (UI-003)

"scored 75%, a below-passing score (below 82%)" now reads "scored 75%, a
below-passing score (80% or below)".

## Consequences recorded for the Owner

- Saved grades keep the previous conversion until an authorized recomputation.
  Recomputation can change a student's retention state and sends the existing
  "Remedial no longer required" or "Remedial required" notification.
- If BUCDM rejects the scale, revert `faculty_percentage_to_gwa_exact()` /
  `faculty_percentage_to_gwa()` in `backend/controllers/FacultyController.php`,
  `percentageToGWAExact()` / `percentageToGWA()` in
  `frontend/src/utils/gradeHelper.ts`, and their tests together.
