CREATE TABLE student_user_account (
    sua_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    stud_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by INT UNSIGNED NULL,
    PRIMARY KEY (sua_id),
    INDEX idx_student_user_account_created_by (created_by),
    CONSTRAINT uq_student_user_account_stud_id UNIQUE (stud_id),
    CONSTRAINT uq_student_user_account_user_id UNIQUE (user_id),
    CONSTRAINT fk_sua_student FOREIGN KEY (stud_id)
        REFERENCES student (stud_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_sua_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
