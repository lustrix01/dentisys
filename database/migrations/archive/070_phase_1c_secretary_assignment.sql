CREATE TABLE secretary_assignment (
    assignment_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sua_id                INT UNSIGNED NOT NULL,
    cs_id                 INT UNSIGNED NOT NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'Active',
    assigned_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    revoked_at            DATETIME(6)  NULL,
    assigned_by           INT UNSIGNED NULL,
    revoked_by            INT UNSIGNED NULL,
    source_invitation_id  INT UNSIGNED NULL,
    PRIMARY KEY (assignment_id),
    INDEX idx_secretary_assignment_sua_id (sua_id),
    INDEX idx_secretary_assignment_cs_id (cs_id),
    INDEX idx_secretary_assignment_assigned_by (assigned_by),
    INDEX idx_secretary_assignment_revoked_by (revoked_by),
    INDEX idx_secretary_assignment_source_invitation (source_invitation_id),
    active_assignment_key VARCHAR(100) GENERATED ALWAYS AS (
        CASE WHEN status = 'Active'
        THEN CONCAT(CAST(sua_id AS CHAR), ':', CAST(cs_id AS CHAR))
        ELSE NULL END
    ) STORED,
    CONSTRAINT uq_secretary_assignment_active UNIQUE (active_assignment_key),
    CONSTRAINT fk_secretary_assignment_sua FOREIGN KEY (sua_id)
        REFERENCES student_user_account (sua_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_secretary_assignment_cs FOREIGN KEY (cs_id)
        REFERENCES class_section (cs_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_secretary_assignment_source_invitation FOREIGN KEY (source_invitation_id)
        REFERENCES secretary_invitation (invitation_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_secretary_assignment_status CHECK (status IN ('Active', 'Revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
