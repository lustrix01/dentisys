CREATE TABLE auth_session (
    session_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id          INT UNSIGNED  NOT NULL,
    session_uuid     CHAR(36)      NOT NULL,
    device_id        INT UNSIGNED  NULL,
    ip_address       VARCHAR(45)   NOT NULL,
    user_agent       VARCHAR(500)  NULL,
    last_seen_at     DATETIME(6)   NULL,
    created_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at       DATETIME(6)   NOT NULL,
    revoked_at       DATETIME(6)   NULL,
    revocation_reason VARCHAR(100)  NULL,
    PRIMARY KEY (session_id),
    INDEX idx_auth_session_user_id (user_id),
    INDEX idx_auth_session_device_id (device_id),
    INDEX idx_auth_session_expires_at (expires_at),
    CONSTRAINT uq_auth_session_uuid UNIQUE (session_uuid),
    CONSTRAINT fk_auth_session_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_auth_session_device FOREIGN KEY (device_id)
        REFERENCES device (device_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
