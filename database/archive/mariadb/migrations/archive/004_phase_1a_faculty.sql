CREATE TABLE faculty (
    faculty_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    faculty_fname       VARCHAR(100) NOT NULL,
    faculty_lname       VARCHAR(100) NOT NULL,
    faculty_bu_email    VARCHAR(255) NOT NULL,
    faculty_is_admin    TINYINT(1)   NOT NULL,
    user_id             INT UNSIGNED NOT NULL,
    PRIMARY KEY (faculty_id),
    INDEX idx_faculty_user_id (user_id),
    CONSTRAINT chk_faculty_faculty_is_admin_bool CHECK (faculty_is_admin IN (0,1)),
    CONSTRAINT fk_faculty_user_id FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
