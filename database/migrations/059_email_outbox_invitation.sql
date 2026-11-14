-- Email History: a Dean invitation email records which invitation (Faculty
-- account) it belongs to, so the Invitation Details dialog matches by id and
-- not by email. Existing rows stay NULL and are matched by email.
ALTER TABLE email_outbox
    ADD COLUMN IF NOT EXISTS invitation_user_id INTEGER NULL
        REFERENCES user_accounts (user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_outbox_invitation_user ON email_outbox (invitation_user_id);
