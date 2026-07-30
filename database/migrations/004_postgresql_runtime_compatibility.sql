-- DentiSys PostgreSQL runtime compatibility repairs.
-- This migration is additive/idempotent and preserves all existing data.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'enrollments'
          AND column_name = 'grade_components_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'enrollments'
          AND column_name = 'grade_components_json'
    ) THEN
        ALTER TABLE enrollments RENAME COLUMN grade_components_jsonb TO grade_components_json;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'enrollments'
          AND column_name = 'remedial_state_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'enrollments'
          AND column_name = 'remedial_state_json'
    ) THEN
        ALTER TABLE enrollments RENAME COLUMN remedial_state_jsonb TO remedial_state_json;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'security_tokens'
          AND column_name = 'metadata_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'security_tokens'
          AND column_name = 'metadata_json'
    ) THEN
        ALTER TABLE security_tokens RENAME COLUMN metadata_jsonb TO metadata_json;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events'
          AND column_name = 'before_state_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events'
          AND column_name = 'before_state_json'
    ) THEN
        ALTER TABLE audit_events RENAME COLUMN before_state_jsonb TO before_state_json;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events'
          AND column_name = 'after_state_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events'
          AND column_name = 'after_state_json'
    ) THEN
        ALTER TABLE audit_events RENAME COLUMN after_state_jsonb TO after_state_json;
    END IF;
END
$$;

ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS scope_cs_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_scope_cs
    ON audit_events (scope_cs_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_audit_scope_class_section'
          AND conrelid = 'audit_events'::regclass
    ) THEN
        ALTER TABLE audit_events
            ADD CONSTRAINT fk_audit_scope_class_section
            FOREIGN KEY (scope_cs_id)
            REFERENCES class_sections (cs_id)
            ON DELETE RESTRICT
            ON UPDATE RESTRICT;
    END IF;
END
$$;
