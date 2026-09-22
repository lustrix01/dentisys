-- Authoritative Student biometric attendance and session timing.
-- All timestamps remain UTC; configured calendar/time values are interpreted
-- by PHP using the application operational timezone.

ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS owner_user_id INTEGER NULL,
    ADD COLUMN IF NOT EXISTS opening_time TIME WITHOUT TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS present_cutoff_time TIME WITHOUT TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS late_cutoff_time TIME WITHOUT TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP(6) WITHOUT TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS revoked_by_user_id INTEGER NULL,
    ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(500) NULL;

UPDATE attendance_sessions
   SET owner_user_id = secretary_user_id
 WHERE owner_user_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_attendance_sessions_owner'
           AND conrelid = 'attendance_sessions'::regclass
    ) THEN
        ALTER TABLE attendance_sessions
            ADD CONSTRAINT fk_attendance_sessions_owner
            FOREIGN KEY (owner_user_id) REFERENCES user_accounts (user_id)
            ON UPDATE RESTRICT ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_attendance_sessions_revoked_by'
           AND conrelid = 'attendance_sessions'::regclass
    ) THEN
        ALTER TABLE attendance_sessions
            ADD CONSTRAINT fk_attendance_sessions_revoked_by
            FOREIGN KEY (revoked_by_user_id) REFERENCES user_accounts (user_id)
            ON UPDATE RESTRICT ON DELETE SET NULL;
    END IF;
END
$$;

ALTER TABLE attendance_sessions
    DROP CONSTRAINT IF EXISTS ck_attendance_sessions_status;

ALTER TABLE attendance_sessions
    ADD CONSTRAINT ck_attendance_sessions_status
    CHECK (status IN ('active', 'ended', 'revoked'));

ALTER TABLE attendance_sessions
    DROP CONSTRAINT IF EXISTS ck_attendance_sessions_lifecycle;

ALTER TABLE attendance_sessions
    ADD CONSTRAINT ck_attendance_sessions_lifecycle
    CHECK (
        (status = 'active' AND ended_at IS NULL AND revoked_at IS NULL)
        OR (status = 'ended' AND ended_at IS NOT NULL AND revoked_at IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'ck_attendance_sessions_timing_order'
           AND conrelid = 'attendance_sessions'::regclass
    ) THEN
        ALTER TABLE attendance_sessions
            ADD CONSTRAINT ck_attendance_sessions_timing_order
            CHECK (
                (opening_time IS NULL AND present_cutoff_time IS NULL AND late_cutoff_time IS NULL)
                OR (opening_time IS NOT NULL
                    AND present_cutoff_time IS NOT NULL
                    AND late_cutoff_time IS NOT NULL
                    AND opening_time < present_cutoff_time
                    AND present_cutoff_time < late_cutoff_time)
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_owner_status
    ON attendance_sessions (owner_user_id, status, session_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_enrollment_session
    ON attendance_records (enrollment_id, attendance_session_id)
    WHERE attendance_session_id IS NOT NULL;

ALTER TABLE biometric_profiles
    ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'not_enrolled',
    ADD COLUMN IF NOT EXISTS consent_disclosure_version VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS protected_object_reference VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS reference_expires_on DATE NULL,
    ADD COLUMN IF NOT EXISTS usable_sample_count SMALLINT NULL;

ALTER TABLE biometric_profiles
    DROP CONSTRAINT IF EXISTS ck_biometric_enrollment_status;

ALTER TABLE biometric_profiles
    ADD CONSTRAINT ck_biometric_enrollment_status
    CHECK (enrollment_status IN ('not_enrolled', 'enrolling', 'active', 'expired', 'revoked'));

ALTER TABLE biometric_profiles
    DROP CONSTRAINT IF EXISTS ck_biometric_usable_sample_count;

ALTER TABLE biometric_profiles
    ADD CONSTRAINT ck_biometric_usable_sample_count
    CHECK (usable_sample_count IS NULL OR usable_sample_count BETWEEN 20 AND 30);

ALTER TABLE biometric_profiles
    DROP CONSTRAINT IF EXISTS ck_biometric_active_reference;

ALTER TABLE biometric_profiles
    ADD CONSTRAINT ck_biometric_active_reference
    CHECK (
        enrollment_status <> 'active'
        OR (
            consent_status = 'approved'
            AND face_enrolled = 1
            AND protected_object_reference IS NOT NULL
            AND btrim(protected_object_reference) <> ''
            AND reference_expires_on IS NOT NULL
            AND enrolled_at IS NOT NULL
            AND revoked_at IS NULL
        )
    );

ALTER TABLE security_tokens
    DROP CONSTRAINT IF EXISTS ck_security_tokens_purpose;

ALTER TABLE security_tokens
    ADD CONSTRAINT ck_security_tokens_purpose
    CHECK (purpose IN (
        'mfa_credential', 'mfa_recovery', 'password_reset',
        'access_token_blacklist', 'secretary_invitation', 'refresh',
        'student_activation', 'biometric_challenge'
    ));

CREATE INDEX IF NOT EXISTS idx_security_tokens_biometric_challenge
    ON security_tokens (related_student_id, purpose, expires_at)
    WHERE purpose = 'biometric_challenge';
