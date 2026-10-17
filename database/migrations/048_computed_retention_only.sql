-- Retention status comes only from system calculation (Owner decision 2026-10-17):
-- active, remedial (final grade 2.50 or worse), cleared (derived from remedial
-- attempts on read) and archived. Warning, critical and Faculty overrides are
-- retired. Existing manual or warning/critical rows revert to the computed state.
-- archived rows are left alone; cleared is derived on read, so only active or
-- remedial is stored. The override columns are kept (additive) and set to NULL.
-- audit_logs is not touched: the history of past overrides stays.
-- Stored grades used the 2026-10-09 conversion, where 2.50 or worse means 80.00%
-- or below. Compare the percentage: the rounded final_gwa can read 2.50 for an
-- exact 2.496, and rounding must never create remediation.
UPDATE enrollments
   SET retention_state = CASE
           WHEN final_percentage IS NOT NULL THEN CASE WHEN final_percentage <= 80.00 THEN 'remedial' ELSE 'active' END
           WHEN final_gwa IS NOT NULL AND final_gwa >= 2.50 THEN 'remedial'
           ELSE 'active' END,
       retention_override_state = NULL,
       retention_override_gwa = NULL,
       retention_override_at = NULL
 WHERE retention_state <> 'archived'
   AND (retention_override_state IS NOT NULL OR retention_state IN ('warning', 'critical'));

UPDATE enrollments
   SET retention_override_state = NULL, retention_override_gwa = NULL, retention_override_at = NULL
 WHERE retention_state = 'archived' AND retention_override_state IS NOT NULL;
