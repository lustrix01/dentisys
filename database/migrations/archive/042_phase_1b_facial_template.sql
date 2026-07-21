CREATE TABLE facial_template (
    template_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lbph_vector LONGBLOB     NOT NULL,
    captured_on DATETIME(6)  NULL,
    student_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (template_id),
    INDEX idx_facial_template_student_id (student_id),
    CONSTRAINT fk_facial_template_student FOREIGN KEY (student_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
