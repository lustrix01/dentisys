-- Restore the Faculty invitation token purpose removed accidentally by migration 011.
-- This is additive so databases that already recorded 011 receive the repair.

ALTER TABLE security_tokens
    DROP CONSTRAINT IF EXISTS ck_security_tokens_purpose;

ALTER TABLE security_tokens
    ADD CONSTRAINT ck_security_tokens_purpose
    CHECK (purpose IN (
        'mfa_credential', 'mfa_recovery', 'password_reset',
        'access_token_blacklist', 'secretary_invitation', 'refresh',
        'student_activation', 'biometric_challenge', 'faculty_invitation'
    ));
