CREATE TABLE remedial_log (
    rl_id                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    rl_student_standing     VARCHAR(100)   NOT NULL,
    rl_date_logged          DATETIME(6)    NOT NULL,
    rl_remedial_score       DECIMAL(6,2)   NOT NULL,
    record_id               INT UNSIGNED   NOT NULL,
    PRIMARY KEY (rl_id),
    INDEX idx_remedial_log_record_id (record_id),
    CONSTRAINT fk_remedial_log_record_id FOREIGN KEY (record_id)
        REFERENCES retention_record (record_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
