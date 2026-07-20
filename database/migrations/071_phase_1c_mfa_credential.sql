CREATE TABLE mfa_credential (
    mfa_id              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    user_id             INT UNSIGNED   NOT NULL,
    ciphertext          VARBINARY(255) NOT NULL,
    nonce               VARBINARY(16)  NOT NULL,
    auth_tag            VARBINARY(16)  NOT NULL,
    enc_key_version     TINYINT UNSIGNED NOT NULL DEFAULT 1,
    enc_algorithm       VARCHAR(30)    NOT NULL DEFAULT 'AES-256-GCM',
    totp_algorithm      VARCHAR(10)    NOT NULL DEFAULT 'SHA1',
    digit_count         TINYINT UNSIGNED NOT NULL DEFAULT 6,
    period_seconds      SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    status              VARCHAR(20)    NOT NULL DEFAULT 'pending',
    provisioned_at      DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    verified_at         DATETIME(6)    NULL,
    last_accepted_step  BIGINT UNSIGNED NULL,
    disabled_at         DATETIME(6)    NULL,
    revoked_at          DATETIME(6)    NULL,
    PRIMARY KEY (mfa_id),
    INDEX idx_mfa_credential_user_id (user_id),
    active_mfa_key VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN status IN ('pending', 'enabled')
        THEN CAST(user_id AS CHAR)
        ELSE NULL END
    ) STORED,
    CONSTRAINT uq_mfa_credential_active UNIQUE (active_mfa_key),
    CONSTRAINT fk_mfa_credential_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_mfa_credential_status CHECK (status IN ('pending', 'enabled', 'disabled', 'revoked')),
    CONSTRAINT chk_mfa_totp_algorithm CHECK (totp_algorithm IN ('SHA1', 'SHA256', 'SHA512')),
    CONSTRAINT chk_mfa_digit_count CHECK (digit_count IN (6, 7, 8))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
