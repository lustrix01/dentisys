-- Correct decimal JSON number parsing introduced in migration 020.
-- The legacy JSON columns remain the preserved source for this corrective
-- backfill; normalized rows are regenerated through the same refresh
-- functions used by the compatibility triggers.

CREATE OR REPLACE FUNCTION normalization_jsonb_number(value JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    raw_value TEXT;
BEGIN
    IF value IS NULL OR jsonb_typeof(value) NOT IN ('number', 'string') THEN
        RETURN NULL;
    END IF;
    raw_value := NULLIF(btrim(value #>> '{}'), '');
    IF raw_value IS NULL OR raw_value !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RETURN NULL;
    END IF;
    RETURN raw_value::NUMERIC;
END
$$;

DO $$
DECLARE
    enrollment_row RECORD;
BEGIN
    -- Rebuild all normalized grade facts from the preserved compatibility
    -- source, including rows whose decimal fields were previously nulled.
    FOR enrollment_row IN
        SELECT enrollment_id,
               grade_components_json,
               final_percentage,
               final_gwa,
               retention_state,
               COALESCE(updated_at, created_at, CURRENT_TIMESTAMP(6))::TIMESTAMP(6) AS recorded_at
          FROM enrollments
         WHERE grade_components_json IS NOT NULL
            OR final_percentage IS NOT NULL
            OR final_gwa IS NOT NULL
    LOOP
        PERFORM refresh_enrollment_grade_breakdown(
            enrollment_row.enrollment_id,
            enrollment_row.grade_components_json,
            enrollment_row.final_percentage,
            enrollment_row.final_gwa,
            enrollment_row.retention_state,
            enrollment_row.recorded_at
        );
    END LOOP;

    -- Rebuild remedial decimal facts from the preserved compatibility source.
    FOR enrollment_row IN
        SELECT enrollment_id,
               remedial_state_json,
               COALESCE(updated_at, created_at, CURRENT_TIMESTAMP(6))::TIMESTAMP(6) AS updated_at
          FROM enrollments
         WHERE remedial_state_json IS NOT NULL
    LOOP
        PERFORM refresh_enrollment_remedial_state(
            enrollment_row.enrollment_id,
            enrollment_row.remedial_state_json,
            enrollment_row.updated_at
        );
    END LOOP;
END
$$;
