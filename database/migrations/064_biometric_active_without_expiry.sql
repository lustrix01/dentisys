-- Backlog 12.2 follow-up: faces no longer expire at term end (spec BIO-005), so an active face no longer needs reference_expires_on.
-- Same constraint as 011 minus that one condition. Without this every enrolment fails with a check violation (HTTP 500).
ALTER TABLE biometric_profiles DROP CONSTRAINT IF EXISTS ck_biometric_active_reference;
ALTER TABLE biometric_profiles
    ADD CONSTRAINT ck_biometric_active_reference
    CHECK (
        enrollment_status <> 'active'
        OR (
            consent_status = 'approved'
            AND face_enrolled = 1
            AND protected_object_reference IS NOT NULL
            AND btrim(protected_object_reference) <> ''
            AND enrolled_at IS NOT NULL
            AND revoked_at IS NULL
        )
    );
