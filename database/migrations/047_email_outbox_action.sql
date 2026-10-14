-- Email History: one send action (one click) groups the outbox rows it created.
-- Existing rows stay NULL and are shown as one-recipient actions.
ALTER TABLE email_outbox ADD COLUMN action_uuid CHAR(36) NULL;
CREATE INDEX idx_email_outbox_sender_action ON email_outbox (sender_user_id, action_uuid);
