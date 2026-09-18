-- Assessment-level transmutation configuration and deterministic attendance link.
ALTER TABLE assessments
    ADD COLUMN transmutation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN transmutation_minimum_percentage NUMERIC(5,2) NOT NULL DEFAULT 50,
    ADD COLUMN transmutation_maximum_percentage NUMERIC(5,2) NOT NULL DEFAULT 100,
    ADD COLUMN attendance_session_date DATE NULL,
    ADD COLUMN attendance_session_code VARCHAR(100) NULL;

ALTER TABLE assessments
    ADD CONSTRAINT ck_assessments_transmutation_bounds
        CHECK (
            transmutation_minimum_percentage BETWEEN 0 AND 100
            AND transmutation_maximum_percentage BETWEEN 0 AND 100
            AND transmutation_minimum_percentage <= transmutation_maximum_percentage
        ),
    ADD CONSTRAINT ck_assessments_attendance_link_pair
        CHECK ((attendance_session_date IS NULL) = (attendance_session_code IS NULL)),
    ADD CONSTRAINT ck_assessments_transmutation_link
        CHECK (
            NOT transmutation_enabled
            OR (
                attendance_session_date IS NOT NULL
                AND NULLIF(BTRIM(attendance_session_code), '') IS NOT NULL
            )
        );

UPDATE system_settings
SET setting_value = setting_value || jsonb_build_object(
        'transmutation_defaults',
        jsonb_build_object('minimum_percentage', 50, 'maximum_percentage', 100)
    ),
    updated_at = CURRENT_TIMESTAMP(6)
WHERE setting_key = 'grading_defaults'
  AND NOT (setting_value ? 'transmutation_defaults');
