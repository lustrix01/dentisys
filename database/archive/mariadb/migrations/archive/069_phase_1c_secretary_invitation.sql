CREATE TABLE secretary_invitation (
    invitation_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    faculty_id       INT UNSIGNED  NOT NULL,
    student_id       INT UNSIGNED  NOT NULL,
    cs_id            INT UNSIGNED  NOT NULL,
    token_digest     BINARY(32)    NOT NULL,
    invited_email    VARCHAR(255)  NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'Pending',
    created_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at       DATETIME(6)   NOT NULL,
    accepted_at      DATETIME(6)   NULL,
    accepted_sua_id  INT UNSIGNED  NULL,
    revoked_at       DATETIME(6)   NULL,
    revoked_by       INT UNSIGNED  NULL,
    remarks          VARCHAR(500)  NULL,
    operation_uuid   CHAR(36)      NOT NULL,
    PRIMARY KEY (invitation_id),
    INDEX idx_secretary_invitation_faculty_id (faculty_id),
    INDEX idx_secretary_invitation_student_id (student_id),
    INDEX idx_secretary_invitation_cs_id (cs_id),
    INDEX idx_secretary_invitation_accepted_sua_id (accepted_sua_id),
    INDEX idx_secretary_invitation_revoked_by (revoked_by),
    active_invitation_key VARCHAR(100) GENERATED ALWAYS AS (
        CASE WHEN status = 'Pending'
        THEN CONCAT(CAST(student_id AS CHAR), ':', CAST(cs_id AS CHAR))
        ELSE NULL END
    ) STORED,
    CONSTRAINT uq_secretary_invitation_active UNIQUE (active_invitation_key),
    CONSTRAINT uq_secretary_invitation_token_digest UNIQUE (token_digest),
    CONSTRAINT uq_secretary_invitation_operation_uuid UNIQUE (operation_uuid),
    CONSTRAINT fk_secretary_invitation_faculty FOREIGN KEY (faculty_id)
        REFERENCES faculty (fac_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_secretary_invitation_student FOREIGN KEY (student_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_secretary_invitation_cs FOREIGN KEY (cs_id)
        REFERENCES class_section (cs_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_secretary_invitation_sua FOREIGN KEY (accepted_sua_id)
        REFERENCES student_user_account (sua_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_secretary_invitation_status CHECK (status IN ('Pending', 'Accepted', 'Expired', 'Revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_secretary_invitation_accept_identity
BEFORE UPDATE ON secretary_invitation
FOR EACH ROW
BEGIN
    DECLARE mapped_stud_id INT UNSIGNED;

    IF NEW.status = 'Accepted' AND NEW.accepted_sua_id IS NOT NULL THEN
        SELECT stud_id INTO mapped_stud_id
        FROM student_user_account
        WHERE sua_id = NEW.accepted_sua_id;

        IF mapped_stud_id IS NULL OR mapped_stud_id <> NEW.student_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Accepted sua_id student does not match invitation student_id';
        END IF;
    END IF;
END$$

DELIMITER ;
