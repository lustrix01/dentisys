CREATE TABLE retention_case (
    case_id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    stg_id                   INT UNSIGNED   NOT NULL,
    policy_version_id        INT UNSIGNED   NOT NULL,
    triggering_grade_snapshot DECIMAL(5,2)  NOT NULL,
    triggered_at             DATETIME(6)    NOT NULL,
    current_stage            VARCHAR(30)    NOT NULL,
    current_status           VARCHAR(20)    NOT NULL,
    remarks                  VARCHAR(500)   NULL,
    created_at               DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6)    NULL ON UPDATE CURRENT_TIMESTAMP(6),
    created_by               INT UNSIGNED   NULL,
    PRIMARY KEY (case_id),
    INDEX idx_retention_case_stg_id (stg_id),
    INDEX idx_retention_case_policy_version_id (policy_version_id),
    INDEX idx_retention_case_created_by (created_by),
    CONSTRAINT uq_retention_case_stg_id UNIQUE (stg_id),
    CONSTRAINT fk_retention_case_stg FOREIGN KEY (stg_id)
        REFERENCES student_term_grade (stg_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_retention_case_policy_version FOREIGN KEY (policy_version_id)
        REFERENCES retention_policy_version (rpv_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
