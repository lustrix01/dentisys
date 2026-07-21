CREATE TABLE student_assessment_grade (
    sg_id           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    sg_raw_score    DECIMAL(6,2)   NOT NULL,
    sg_grade        DECIMAL(5,2)   NOT NULL,
    a_id            INT UNSIGNED   NOT NULL,
    en_id           INT UNSIGNED   NOT NULL,
    PRIMARY KEY (sg_id),
    INDEX idx_student_assessment_grade_a_id (a_id),
    INDEX idx_student_assessment_grade_en_id (en_id),
    CONSTRAINT fk_student_assessment_grade_a_id FOREIGN KEY (a_id)
        REFERENCES assessment (a_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_student_assessment_grade_en_id FOREIGN KEY (en_id)
        REFERENCES enrollment (en_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
