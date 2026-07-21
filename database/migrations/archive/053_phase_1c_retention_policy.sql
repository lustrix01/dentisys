CREATE TABLE retention_policy (
    policy_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_name VARCHAR(100) NOT NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (policy_id),
    active_policy_key VARCHAR(5) GENERATED ALWAYS AS (
        CASE WHEN is_active = 1 THEN '1' ELSE NULL END
    ) STORED,
    CONSTRAINT uq_retention_policy_active UNIQUE (active_policy_key),
    CONSTRAINT chk_retention_policy_is_active_bool CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
