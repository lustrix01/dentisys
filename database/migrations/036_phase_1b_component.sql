CREATE TABLE component (
    comp_id   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    comp_name VARCHAR(100)   NOT NULL,
    weight    DECIMAL(5,4)   NOT NULL,
    cc_id     INT UNSIGNED   NOT NULL,
    PRIMARY KEY (comp_id),
    INDEX idx_component_cc_id (cc_id),
    CONSTRAINT fk_component_course_component FOREIGN KEY (cc_id)
        REFERENCES course_component (cc_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
