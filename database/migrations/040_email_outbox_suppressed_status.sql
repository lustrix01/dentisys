-- EML-001: outside production, Faculty notices to addresses that are not on
-- the test allowlist are recorded as Suppressed (test mode) and not sent.
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS ck_email_status;
ALTER TABLE email_outbox
    ADD CONSTRAINT ck_email_status CHECK (status IN ('Pending', 'Sent', 'Failed', 'Suppressed'));
