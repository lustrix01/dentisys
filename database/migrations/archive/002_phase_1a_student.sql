CREATE TABLE student (
    student_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_number      VARCHAR(50)  NOT NULL,
    student_fname       VARCHAR(100) NOT NULL,
    student_lname       VARCHAR(100) NOT NULL,
    student_bu_email    VARCHAR(255) NOT NULL,
    student_contact     VARCHAR(50)  NOT NULL,
    student_yr_level    VARCHAR(20)  NOT NULL,
    student_status      VARCHAR(50)  NOT NULL,
    student_face_image  VARCHAR(500) NULL,
    PRIMARY KEY (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
