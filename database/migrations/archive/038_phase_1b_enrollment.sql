CREATE TABLE enrollment (
    en_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    en_status     VARCHAR(50)  NOT NULL,
    date_enrolled DATE         NULL,
    student_id    INT UNSIGNED NOT NULL,
    cs_id         INT UNSIGNED NOT NULL,
    PRIMARY KEY (en_id),
    INDEX idx_enrollment_student_id (student_id),
    INDEX idx_enrollment_cs_id (cs_id),
    CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_enrollment_class_section FOREIGN KEY (cs_id)
        REFERENCES class_section (cs_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
