CREATE TABLE class_section (
    cs_id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cs_name             VARCHAR(255) NOT NULL,
    cs_semester         VARCHAR(50)  NOT NULL,
    cs_year_level       VARCHAR(20)  NOT NULL,
    cs_lab_room         VARCHAR(100) NULL,
    cs_lec_room         VARCHAR(100) NULL,
    cs_block            VARCHAR(50)  NOT NULL,
    cs_block_secretary  VARCHAR(100) NULL,
    status              VARCHAR(50)  NOT NULL,
    course_id           INT UNSIGNED NOT NULL,
    instructor_id       INT UNSIGNED NOT NULL,
    PRIMARY KEY (cs_id),
    INDEX idx_class_section_course_id (course_id),
    INDEX idx_class_section_instructor_id (instructor_id),
    CONSTRAINT fk_class_section_course_id FOREIGN KEY (course_id)
        REFERENCES course (course_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_class_section_instructor_id FOREIGN KEY (instructor_id)
        REFERENCES faculty (faculty_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
