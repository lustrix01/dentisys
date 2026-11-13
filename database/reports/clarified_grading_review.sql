-- Read-only impact review for the 2026-11-13 password/grading clarification.
-- Run against a database snapshot or a read-only connection. This report does
-- not update saved grades, attempts, outcomes, or assessment rows.

-- Remedial history attached to a final course grade outside DentiSys eligibility.
SELECT e.enrollment_id,
       cs.cs_id,
       c.course_code,
       COALESCE(egb.final_gwa, e.final_gwa) AS final_gwa,
       ra.attempt_number,
       ra.percentage,
       ra.outcome
  FROM enrollment_remedial_attempts ra
  JOIN enrollments e ON e.enrollment_id = ra.enrollment_id
  JOIN class_sections cs ON cs.cs_id = e.cs_id
  JOIN courses c ON c.course_id = cs.course_id
  LEFT JOIN enrollment_grade_breakdowns egb ON egb.enrollment_id = e.enrollment_id
 WHERE COALESCE(egb.final_gwa, e.final_gwa) IS NULL
    OR COALESCE(egb.final_gwa, e.final_gwa) < 2.5
    OR COALESCE(egb.final_gwa, e.final_gwa) >= 5.0
 ORDER BY e.enrollment_id, ra.attempt_number;

-- Remedial results whose stored outcome differs from the clarified 75% rule.
SELECT e.enrollment_id,
       cs.cs_id,
       c.course_code,
       ra.attempt_number,
       ra.percentage,
       ra.outcome AS stored_outcome,
       CASE WHEN ra.percentage >= 75 THEN 'passed' ELSE 'failed' END AS clarified_outcome
  FROM enrollment_remedial_attempts ra
  JOIN enrollments e ON e.enrollment_id = ra.enrollment_id
  JOIN class_sections cs ON cs.cs_id = e.cs_id
  JOIN courses c ON c.course_id = cs.course_id
 WHERE ra.outcome <> CASE WHEN ra.percentage >= 75 THEN 'passed' ELSE 'failed' END
 ORDER BY e.enrollment_id, ra.attempt_number;

-- Cost-recovery rows using excess precision or affected by the 2.4/2.5 split.
SELECT e.enrollment_id,
       cs.cs_id,
       c.course_code,
       cr.final_grade,
       cr.outcome AS stored_outcome,
       CASE WHEN cr.final_grade <= 2.4 THEN 'passed' ELSE 'failed' END AS clarified_outcome,
       (cr.final_grade * 10 <> trunc(cr.final_grade * 10)) AS has_excess_precision,
       (cr.final_grade > 2.4 AND cr.final_grade < 2.5) AS between_pass_and_fail_boundaries
  FROM enrollment_cost_recovery cr
  JOIN enrollments e ON e.enrollment_id = cr.enrollment_id
  JOIN class_sections cs ON cs.cs_id = e.cs_id
  JOIN courses c ON c.course_id = cs.course_id
 WHERE cr.final_grade * 10 <> trunc(cr.final_grade * 10)
    OR cr.outcome <> CASE WHEN cr.final_grade <= 2.4 THEN 'passed' ELSE 'failed' END
    OR (cr.final_grade > 2.4 AND cr.final_grade < 2.5)
 ORDER BY e.enrollment_id;

-- Legacy per-assessment bounds ignored under the fixed 50%/100% formula.
SELECT a.assessment_id,
       cs.cs_id,
       c.course_code,
       a.title,
       a.transmutation_enabled,
       a.transmutation_minimum_percentage AS legacy_minimum_percentage,
       a.transmutation_maximum_percentage AS legacy_maximum_percentage
  FROM assessments a
  JOIN class_sections cs ON cs.cs_id = a.cs_id
  JOIN courses c ON c.course_id = cs.course_id
 WHERE a.transmutation_minimum_percentage <> 50
    OR a.transmutation_maximum_percentage <> 100
 ORDER BY cs.cs_id, a.assessment_id;
