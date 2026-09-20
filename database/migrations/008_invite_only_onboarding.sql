-- Invite-only Faculty onboarding uses the existing secure token store.

ALTER TABLE security_tokens DROP CONSTRAINT IF EXISTS ck_security_tokens_purpose;
ALTER TABLE security_tokens
    ADD CONSTRAINT ck_security_tokens_purpose
    CHECK (purpose IN ('mfa_credential', 'mfa_recovery', 'password_reset',
                       'access_token_blacklist', 'secretary_invitation',
                       'refresh', 'student_activation', 'faculty_invitation'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_security_tokens_faculty_invitation_live
    ON security_tokens (user_id)
    WHERE purpose = 'faculty_invitation'
      AND used_at IS NULL
      AND revoked_at IS NULL;
