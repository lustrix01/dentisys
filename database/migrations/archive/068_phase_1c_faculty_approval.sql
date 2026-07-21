CREATE TABLE faculty_approval (
    approval_id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    applicant_user_id         INT UNSIGNED NOT NULL,
    submission_sequence       INT UNSIGNED NOT NULL,
    status                    VARCHAR(15)  NOT NULL DEFAULT 'Pending',
    submitted_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reviewer_user_id          INT UNSIGNED NULL,
    reviewed_at               DATETIME(6)  NULL,
    remarks                   VARCHAR(500) NULL,
    resubmitted_from_id       INT UNSIGNED NULL,
    operation_uuid            CHAR(36)     NOT NULL,
    reviewer_username_snapshot VARCHAR(100) NULL,
    PRIMARY KEY (approval_id),
    INDEX idx_faculty_approval_applicant (applicant_user_id),
    INDEX idx_faculty_approval_reviewer (reviewer_user_id),
    active_pending_key VARCHAR(30) GENERATED ALWAYS AS (
        CASE WHEN status = 'Pending' THEN CAST(applicant_user_id AS CHAR) ELSE NULL END
    ) STORED,
    CONSTRAINT uq_faculty_approval_active_pending UNIQUE (active_pending_key),
    CONSTRAINT uq_faculty_approval_applicant_seq UNIQUE (applicant_user_id, submission_sequence),
    CONSTRAINT uq_faculty_approval_operation_uuid UNIQUE (operation_uuid),
    CONSTRAINT fk_faculty_approval_applicant FOREIGN KEY (applicant_user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_faculty_approval_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_faculty_approval_no_update_completed
BEFORE UPDATE ON faculty_approval
FOR EACH ROW
BEGIN
    IF OLD.status IN ('Approved', 'Rejected') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Completed faculty_approval is immutable';
    END IF;
END$$

CREATE TRIGGER trg_faculty_approval_no_delete
BEFORE DELETE ON faculty_approval
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'faculty_approval rows cannot be deleted'$$

DELIMITER ;
