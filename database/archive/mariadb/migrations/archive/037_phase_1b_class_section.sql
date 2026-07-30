CREATE TABLE class_section (
    cs_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cs_name        VARCHAR(255) NOT NULL,
    cs_semester    VARCHAR(50)  NOT NULL,
    cs_school_year VARCHAR(20)  NOT NULL,
    cs_lab_room    VARCHAR(100) NULL,
    cs_lec_room    VARCHAR(100) NULL,
    cs_block       VARCHAR(50)  NOT NULL,
    cs_block_sec   VARCHAR(100) NULL,
    status         VARCHAR(50)  NOT NULL,
    cc_id          INT UNSIGNED NOT NULL,
    PRIMARY KEY (cs_id),
    INDEX idx_class_section_cc_id (cc_id),
    CONSTRAINT fk_class_section_course_component FOREIGN KEY (cc_id)
        REFERENCES course_component (cc_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
