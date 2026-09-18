-- Google Sign-In Phase 1: existing-account identity binding only.
-- Additive migration; password credentials and existing sessions remain intact.

ALTER TABLE user_accounts
    ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_accounts_google_subject
    ON user_accounts (google_subject)
    WHERE google_subject IS NOT NULL;

ALTER TABLE auth_sessions
    DROP CONSTRAINT IF EXISTS ck_auth_sessions_authentication_source;

ALTER TABLE auth_sessions
    ADD CONSTRAINT ck_auth_sessions_authentication_source
    CHECK (authentication_source IN ('password', 'google', 'development_mock'));
