-- Preserve the canonical Student identity as five independent name parts.
-- Existing first/middle/last values remain authoritative; no legacy display
-- name is parsed or backfilled into the optional affixes.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS name_prefix VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS name_suffix VARCHAR(50) NULL;

-- Authoritative academic year used by server-side class eligibility checks.
-- Keep this as a JSON string so the existing system_settings contract stays
-- simple and an Owner can change it through an additive settings operation.
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'academic.current_school_year',
    '"2026-2027"'::jsonb,
    0,
    'Authoritative current school year for class creation and historical-class mutation checks.'
)
ON CONFLICT (setting_key) DO NOTHING;
