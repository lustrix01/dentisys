CREATE TABLE auth_throttle (
    throttle_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    scope_type        VARCHAR(20)   NOT NULL,
    scope_hash        BINARY(32)    NOT NULL,
    endpoint_code     VARCHAR(50)   NOT NULL,
    window_started_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    attempt_count     INT UNSIGNED  NOT NULL DEFAULT 1,
    blocked_until     DATETIME(6)   NULL,
    updated_at        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (throttle_id),
    INDEX idx_auth_throttle_blocked_until (blocked_until),
    CONSTRAINT uq_auth_throttle_lookup UNIQUE (scope_hash, endpoint_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
