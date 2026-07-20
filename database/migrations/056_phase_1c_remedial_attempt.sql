CREATE TABLE remedial_attempt (
    attempt_id       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    case_id          INT UNSIGNED   NOT NULL,
    attempt_type     VARCHAR(15)    NOT NULL,
    status           VARCHAR(15)    NOT NULL DEFAULT 'SCHEDULED',
    scheduled_date   DATE           NOT NULL,
    completed_date   DATE           NULL,
    percentage_score DECIMAL(5,2)   NULL,
    grade            DECIMAL(4,2)   NULL,
    result           VARCHAR(10)    NULL,
    remarks          VARCHAR(500)   NULL,
    created_at       DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6)    NULL ON UPDATE CURRENT_TIMESTAMP(6),
    assessed_by      INT UNSIGNED   NULL,
    PRIMARY KEY (attempt_id),
    INDEX idx_remedial_attempt_case_id (case_id),
    INDEX idx_remedial_attempt_assessed_by (assessed_by),
    CONSTRAINT uq_remedial_attempt_case_type UNIQUE (case_id, attempt_type),
    CONSTRAINT fk_remedial_attempt_case FOREIGN KEY (case_id)
        REFERENCES retention_case (case_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_remedial_attempt_type CHECK (attempt_type IN ('FIRST_REMEDIAL', 'SECOND_REMEDIAL', 'COST_RECOVERY')),
    CONSTRAINT chk_remedial_attempt_status CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_remedial_attempt_result CHECK (result IS NULL OR result IN ('PASSED', 'FAILED')),
    CONSTRAINT chk_ra_score_range CHECK (percentage_score IS NULL OR (percentage_score >= 0.00 AND percentage_score <= 100.00)),
    CONSTRAINT chk_ra_scheduled CHECK (
        status <> 'SCHEDULED'
        OR (percentage_score IS NULL AND grade IS NULL AND result IS NULL AND completed_date IS NULL)
    ),
    CONSTRAINT chk_ra_cancelled CHECK (
        status <> 'CANCELLED'
        OR (result IS NULL AND completed_date IS NULL)
    ),
    CONSTRAINT chk_ra_result_requires_completed CHECK (result IS NULL OR status = 'COMPLETED'),
    CONSTRAINT chk_ra_remedial_completed CHECK (
        attempt_type NOT IN ('FIRST_REMEDIAL', 'SECOND_REMEDIAL')
        OR status <> 'COMPLETED'
        OR (percentage_score IS NOT NULL AND grade IS NULL AND result IS NOT NULL AND completed_date IS NOT NULL)
    ),
    CONSTRAINT chk_ra_cost_completed CHECK (
        attempt_type <> 'COST_RECOVERY'
        OR status <> 'COMPLETED'
        OR (grade IS NOT NULL AND percentage_score IS NULL AND result IS NOT NULL AND completed_date IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_remedial_attempt_no_update_completed
BEFORE UPDATE ON remedial_attempt
FOR EACH ROW
BEGIN
    IF OLD.status = 'COMPLETED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Completed remedial_attempt is immutable';
    END IF;
END$$

CREATE TRIGGER trg_remedial_attempt_no_delete
BEFORE DELETE ON remedial_attempt
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'remedial_attempt rows cannot be deleted'$$

DELIMITER ;
