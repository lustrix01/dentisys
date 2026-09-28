-- A Faculty retention status override persists across grade recomputation
-- until the student's course grade actually changes (better or worse). The
-- grade at the time of the override is kept to detect that change.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS retention_override_state TEXT NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS retention_override_gwa NUMERIC(4,2) NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS retention_override_at TIMESTAMP(6) NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_enrollments_retention_override_state') THEN
        ALTER TABLE enrollments ADD CONSTRAINT ck_enrollments_retention_override_state CHECK (
            retention_override_state IS NULL
            OR retention_override_state IN ('active', 'warning', 'critical', 'remedial')
        );
    END IF;
END
$$;

COMMENT ON COLUMN enrollments.retention_override_state IS
    'Faculty-set retention state; kept on recompute while the course grade equals retention_override_gwa.';
COMMENT ON COLUMN enrollments.retention_override_gwa IS
    'Course grade when the override was set; a different recomputed grade clears the override.';
