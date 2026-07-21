CREATE TABLE biometric_consent (
    consent_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    stud_id         INT UNSIGNED NOT NULL,
    consent_status  VARCHAR(10)  NOT NULL DEFAULT 'pending',
    responded_at    DATETIME(6)  NULL,
    superseded_at   DATETIME(6)  NULL,
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    recorded_by     INT UNSIGNED NULL,
    PRIMARY KEY (consent_id),
    INDEX idx_biometric_consent_stud_id (stud_id),
    INDEX idx_biometric_consent_recorded_by (recorded_by),
    current_consent_key VARCHAR(10) GENERATED ALWAYS AS (
        CASE WHEN superseded_at IS NULL THEN CAST(stud_id AS CHAR) ELSE NULL END
    ) STORED,
    CONSTRAINT uq_biometric_consent_current UNIQUE (current_consent_key),
    CONSTRAINT fk_biometric_consent_student FOREIGN KEY (stud_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_biometric_consent_status CHECK (consent_status IN ('pending', 'approved', 'declined'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
