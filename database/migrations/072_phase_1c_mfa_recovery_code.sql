CREATE TABLE mfa_recovery_code (
    rc_id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    mfa_id       INT UNSIGNED  NOT NULL,
    code_hash    VARCHAR(255)  NOT NULL,
    consumed     TINYINT(1)    NOT NULL DEFAULT 0,
    consumed_at  DATETIME(6)   NULL,
    created_at   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (rc_id),
    INDEX idx_mfa_recovery_code_mfa_id (mfa_id),
    CONSTRAINT fk_mfa_recovery_code_credential FOREIGN KEY (mfa_id)
        REFERENCES mfa_credential (mfa_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_mfa_recovery_code_consumed_bool CHECK (consumed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
