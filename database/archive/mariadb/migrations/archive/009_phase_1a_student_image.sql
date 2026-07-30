CREATE TABLE student_image (
    si_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    file_path   VARCHAR(500) NOT NULL,
    is_primary  TINYINT(1)   NOT NULL,
    student_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (si_id),
    INDEX idx_student_image_student_id (student_id),
    CONSTRAINT chk_student_image_is_primary_bool CHECK (is_primary IN (0,1)),
    CONSTRAINT fk_student_image_student_id FOREIGN KEY (student_id)
        REFERENCES student (student_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
