CREATE TABLE access_token_revocation (
    atr_id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id          INT UNSIGNED  NOT NULL,
    session_id       INT UNSIGNED  NULL,
    jti_digest       BINARY(32)    NOT NULL,
    revoked_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    orig_expires_at  DATETIME(6)   NOT NULL,
    revocation_reason VARCHAR(100)  NULL,
    PRIMARY KEY (atr_id),
    INDEX idx_access_token_revocation_user_id (user_id),
    INDEX idx_access_token_revocation_session_id (session_id),
    INDEX idx_access_token_revocation_orig_expires_at (orig_expires_at),
    CONSTRAINT uq_access_token_revocation_jti_digest UNIQUE (jti_digest),
    CONSTRAINT fk_atr_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_atr_auth_session FOREIGN KEY (session_id)
        REFERENCES auth_session (session_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
