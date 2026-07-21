CREATE TABLE refresh_token (
    rt_id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    session_id         INT UNSIGNED  NOT NULL,
    token_digest       BINARY(32)    NOT NULL,
    token_family       CHAR(36)      NOT NULL,
    parent_rt_id       INT UNSIGNED  NULL,
    replacement_rt_id  INT UNSIGNED  NULL,
    rotation_counter   INT UNSIGNED  NOT NULL DEFAULT 1,
    issued_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at         DATETIME(6)   NOT NULL,
    rotated_at         DATETIME(6)   NULL,
    revoked_at         DATETIME(6)   NULL,
    reuse_detected_at  DATETIME(6)   NULL,
    revocation_reason  VARCHAR(100)  NULL,
    PRIMARY KEY (rt_id),
    INDEX idx_refresh_token_session_id (session_id),
    INDEX idx_refresh_token_family (token_family),
    INDEX idx_refresh_token_expires_at (expires_at),
    CONSTRAINT uq_refresh_token_digest UNIQUE (token_digest),
    CONSTRAINT uq_refresh_token_parent UNIQUE (parent_rt_id),
    CONSTRAINT fk_refresh_token_session FOREIGN KEY (session_id)
        REFERENCES auth_session (session_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
