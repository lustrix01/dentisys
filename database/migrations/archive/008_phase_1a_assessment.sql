CREATE TABLE assessment (
    a_id        INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    a_title     VARCHAR(255)   NOT NULL,
    a_type      VARCHAR(50)    NOT NULL,
    a_max_score DECIMAL(6,2)   NOT NULL,
    a_date      DATE           NOT NULL,
    course_id   INT UNSIGNED   NOT NULL,
    PRIMARY KEY (a_id),
    INDEX idx_assessment_course_id (course_id),
    CONSTRAINT fk_assessment_course_id FOREIGN KEY (course_id)
        REFERENCES course (course_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
