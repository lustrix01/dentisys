CREATE TABLE faculty (
    fac_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fac_fname  VARCHAR(100) NOT NULL,
    fac_lname  VARCHAR(100) NOT NULL,
    fac_mname  VARCHAR(100) NULL,
    is_admin   TINYINT(1)   NOT NULL,
    contact_no VARCHAR(50)  NULL,
    emp_status VARCHAR(50)  NULL,
    user_id    INT UNSIGNED NOT NULL,
    PRIMARY KEY (fac_id),
    INDEX idx_faculty_user_id (user_id),
    CONSTRAINT chk_faculty_is_admin_bool CHECK (is_admin IN (0,1)),
    CONSTRAINT fk_faculty_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
