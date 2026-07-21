CREATE TABLE password_reset_token (
    prt_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id      INT UNSIGNED  NOT NULL,
    token_digest BINARY(32)    NOT NULL,
    consumed     TINYINT(1)    NOT NULL DEFAULT 0,
    created_at   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at   DATETIME(6)   NOT NULL,
    consumed_at  DATETIME(6)   NULL,
    PRIMARY KEY (prt_id),
    INDEX idx_password_reset_token_user_id (user_id),
    INDEX idx_password_reset_token_expires_at (expires_at),
    CONSTRAINT uq_password_reset_token_digest UNIQUE (token_digest),
    CONSTRAINT fk_password_reset_token_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_password_reset_token_consumed_bool CHECK (consumed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
