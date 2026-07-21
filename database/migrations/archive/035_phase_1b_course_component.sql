CREATE TABLE course_component (
    cc_id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    lab_weight    DECIMAL(5,4)   NOT NULL,
    lec_weight    DECIMAL(5,4)   NOT NULL,
    has_zero_rule TINYINT(1)     NOT NULL,
    fac_id        INT UNSIGNED   NOT NULL,
    course_id     INT UNSIGNED   NOT NULL,
    PRIMARY KEY (cc_id),
    INDEX idx_course_component_fac_id (fac_id),
    INDEX idx_course_component_course_id (course_id),
    CONSTRAINT chk_course_component_has_zero_rule_bool CHECK (has_zero_rule IN (0,1)),
    CONSTRAINT fk_course_component_faculty FOREIGN KEY (fac_id)
        REFERENCES faculty (fac_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_course_component_course FOREIGN KEY (course_id)
        REFERENCES course (course_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
