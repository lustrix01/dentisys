CREATE TABLE student_term_grade (
    stg_id      INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    stg_term    VARCHAR(50)    NOT NULL,
    stg_grade   DECIMAL(5,2)   NOT NULL,
    stg_remarks VARCHAR(255)   NULL,
    en_id       INT UNSIGNED   NOT NULL,
    PRIMARY KEY (stg_id),
    INDEX idx_student_term_grade_en_id (en_id),
    CONSTRAINT fk_student_term_grade_enrollment FOREIGN KEY (en_id)
        REFERENCES enrollment (en_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
