CREATE TABLE retention_record (
    record_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    record_current_stage VARCHAR(50)  NOT NULL,
    record_status        VARCHAR(50)  NOT NULL,
    record_remarks       TEXT         NULL,
    student_id           INT UNSIGNED NOT NULL,
    PRIMARY KEY (record_id),
    INDEX idx_retention_record_student_id (student_id),
    CONSTRAINT fk_retention_record_student FOREIGN KEY (student_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
