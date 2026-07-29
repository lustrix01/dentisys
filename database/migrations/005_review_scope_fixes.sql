-- DentiSys review-scope remediation: optional email MFA and scoped audit events.

ALTER TABLE user_accounts
    ADD COLUMN email_mfa_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER token_version,
    ADD COLUMN email_mfa_verified_at DATETIME(6) NULL AFTER email_mfa_enabled;

ALTER TABLE security_tokens
    MODIFY COLUMN purpose ENUM(
        'mfa_credential',
        'mfa_recovery',
        'email_otp',
        'password_reset',
        'access_token_blacklist',
        'secretary_invitation',
        'refresh'
    ) NOT NULL;

ALTER TABLE email_outbox
    MODIFY COLUMN email_type ENUM(
        'Privacy Consent',
        'At-Risk Notification',
        'Secretary Invitation',
        'Faculty Registration Approved',
        'Faculty Registration Rejected',
        'Authentication Code',
        'Other'
    ) NOT NULL;

ALTER TABLE audit_events
    ADD COLUMN scope_cs_id INT UNSIGNED NULL AFTER session_id,
    ADD INDEX idx_audit_events_scope_cs (scope_cs_id),
    ADD CONSTRAINT fk_audit_scope_class_section
        FOREIGN KEY (scope_cs_id)
        REFERENCES class_sections (cs_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT;
