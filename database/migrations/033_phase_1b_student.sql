CREATE TABLE student (
    stud_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    stud_number    VARCHAR(50)  NOT NULL,
    stud_fname     VARCHAR(100) NOT NULL,
    stud_lname     VARCHAR(100) NOT NULL,
    stud_mname     VARCHAR(100) NULL,
    sex            VARCHAR(10)  NOT NULL,
    birthdate      DATE         NULL,
    admission_date DATE         NULL,
    stud_bu_email  VARCHAR(255) NOT NULL,
    stud_contact   VARCHAR(50)  NOT NULL,
    year_level     VARCHAR(20)  NOT NULL,
    is_regular     TINYINT(1)   NOT NULL,
    acc_status     VARCHAR(50)  NOT NULL,
    PRIMARY KEY (stud_id),
    CONSTRAINT chk_student_is_regular_bool CHECK (is_regular IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
