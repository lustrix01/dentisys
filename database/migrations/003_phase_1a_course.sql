CREATE TABLE course (
    course_id           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    course_code         VARCHAR(50)    NOT NULL,
    course_name         VARCHAR(255)   NOT NULL,
    course_units        DECIMAL(3,1)   NOT NULL,
    lec_weight           DECIMAL(5,4)   NOT NULL,
    term_exam_weight     DECIMAL(5,4)   NOT NULL,
    lec_quiz_weight      DECIMAL(5,4)   NOT NULL,
    recit_weight         DECIMAL(5,4)   NOT NULL,
    output_weight        DECIMAL(5,4)   NOT NULL,
    lab_weight           DECIMAL(5,4)   NOT NULL,
    prac_exam_weight     DECIMAL(5,4)   NOT NULL,
    lab_exercise_weight  DECIMAL(5,4)   NOT NULL,
    lab_quiz_weight      DECIMAL(5,4)   NOT NULL,
    lab_perf_weight      DECIMAL(5,4)   NOT NULL,
    has_zero_rule        TINYINT(1)     NOT NULL,
    PRIMARY KEY (course_id),
    CONSTRAINT chk_course_has_zero_rule_bool CHECK (has_zero_rule IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
