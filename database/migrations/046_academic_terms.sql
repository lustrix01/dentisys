-- ACA-002: Dean-owned dates; classes keep their existing natural term identity.
CREATE TABLE academic_terms (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    school_year varchar(9) NOT NULL CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
    semester varchar(6) NOT NULL CHECK (semester IN ('1ST', '2ND', 'Summer')),
    start_date date NOT NULL,
    end_date date NOT NULL CHECK (end_date > start_date),
    created_by_user_id bigint REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    updated_by_user_id bigint REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE (school_year, semester)
);
-- Enrollment provenance lets term edits follow the original validity source,
-- including after a Student's class membership changes. Legacy rows stay intact.
ALTER TABLE biometric_profiles
    ADD COLUMN reference_term_id bigint REFERENCES academic_terms(id) ON DELETE SET NULL,
    ADD COLUMN reference_cs_id bigint REFERENCES class_sections(cs_id) ON DELETE SET NULL;
CREATE INDEX ix_biometric_profiles_term ON biometric_profiles(reference_term_id)
    WHERE enrollment_status IN ('active', 'enrolling');
-- apply-migrations.sh grants the configured app role all tables/sequences and
-- default privileges, just as for the preceding migrations.
