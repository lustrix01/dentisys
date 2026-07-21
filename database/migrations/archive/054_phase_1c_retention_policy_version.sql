CREATE TABLE retention_policy_version (
    rpv_id                       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    policy_id                    INT UNSIGNED   NOT NULL,
    version_number               INT UNSIGNED   NOT NULL,
    initial_trigger_operator     VARCHAR(2)     NOT NULL DEFAULT '>=',
    initial_trigger_grade        DECIMAL(3,2)   NOT NULL DEFAULT 2.50,
    first_remedial_pass_operator VARCHAR(2)     NOT NULL DEFAULT '>=',
    first_remedial_pass_pct      DECIMAL(5,2)   NOT NULL DEFAULT 50.00,
    second_remedial_pass_operator VARCHAR(2)    NOT NULL DEFAULT '>=',
    second_remedial_pass_pct     DECIMAL(5,2)   NOT NULL DEFAULT 50.00,
    cost_recovery_pass_operator  VARCHAR(2)     NOT NULL DEFAULT '<=',
    cost_recovery_pass_grade     DECIMAL(3,2)   NOT NULL DEFAULT 2.40,
    higher_numeric_grade_is_worse TINYINT(1)    NOT NULL DEFAULT 1,
    effective_from               DATETIME(6)    NOT NULL,
    created_at                   DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by                   INT UNSIGNED   NULL,
    PRIMARY KEY (rpv_id),
    INDEX idx_rpv_policy_id (policy_id),
    INDEX idx_rpv_created_by (created_by),
    CONSTRAINT uq_rpv_policy_version UNIQUE (policy_id, version_number),
    CONSTRAINT fk_rpv_policy FOREIGN KEY (policy_id)
        REFERENCES retention_policy (policy_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_rpv_trigger_operator CHECK (initial_trigger_operator IN ('>=', '<=', '>', '<', '=')),
    CONSTRAINT chk_rpv_first_operator CHECK (first_remedial_pass_operator IN ('>=', '<=', '>', '<', '=')),
    CONSTRAINT chk_rpv_second_operator CHECK (second_remedial_pass_operator IN ('>=', '<=', '>', '<', '=')),
    CONSTRAINT chk_rpv_cost_operator CHECK (cost_recovery_pass_operator IN ('>=', '<=', '>', '<', '=')),
    CONSTRAINT chk_rpv_higher_is_worse_bool CHECK (higher_numeric_grade_is_worse IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
