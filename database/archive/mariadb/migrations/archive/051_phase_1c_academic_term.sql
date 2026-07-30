CREATE TABLE academic_term (
    term_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    term_code   VARCHAR(20)  NOT NULL,
    school_year VARCHAR(9)   NOT NULL,
    semester    VARCHAR(10)  NOT NULL,
    start_date  DATE         NULL,
    end_date    DATE         NULL,
    PRIMARY KEY (term_id),
    CONSTRAINT uq_academic_term_code UNIQUE (term_code),
    CONSTRAINT uq_academic_term_year_semester UNIQUE (school_year, semester),
    CONSTRAINT chk_academic_term_semester CHECK (semester IN ('1ST', '2ND', 'Summer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
