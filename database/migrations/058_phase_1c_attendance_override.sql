CREATE TABLE attendance_override (
    override_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    rec_id         INT UNSIGNED  NOT NULL,
    overridden_by  INT UNSIGNED  NOT NULL,
    previous_status VARCHAR(10)  NOT NULL,
    new_status     VARCHAR(10)   NOT NULL,
    reason         VARCHAR(500)  NOT NULL,
    overridden_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    operation_uuid CHAR(36)      NOT NULL,
    PRIMARY KEY (override_id),
    INDEX idx_attendance_override_rec_id (rec_id),
    INDEX idx_attendance_override_overridden_by (overridden_by),
    CONSTRAINT uq_attendance_override_operation_uuid UNIQUE (operation_uuid),
    CONSTRAINT fk_attendance_override_record FOREIGN KEY (rec_id)
        REFERENCES attendance_record (rec_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_override_user FOREIGN KEY (overridden_by)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_attendance_override_prev_status CHECK (previous_status IN ('present', 'absent', 'late', 'excused')),
    CONSTRAINT chk_attendance_override_new_status CHECK (new_status IN ('present', 'absent', 'late')),
    CONSTRAINT chk_attendance_override_status_differ CHECK (previous_status <> new_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_attendance_override_no_update
BEFORE UPDATE ON attendance_override
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_override is immutable'$$

CREATE TRIGGER trg_attendance_override_no_delete
BEFORE DELETE ON attendance_override
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_override rows cannot be deleted'$$

DELIMITER ;
