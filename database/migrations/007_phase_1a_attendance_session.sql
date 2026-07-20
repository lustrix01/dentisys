CREATE TABLE attendance_session (
    se_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    se_date          DATE         NOT NULL,
    se_created_by    INT UNSIGNED NULL,
    se_start         TIME         NOT NULL,
    se_end           TIME         NOT NULL,
    se_code          VARCHAR(50)  NOT NULL,
    se_device_id     INT UNSIGNED NULL,
    cs_id            INT UNSIGNED NOT NULL,
    se_secretary_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (se_id),
    INDEX idx_attendance_session_se_created_by (se_created_by),
    INDEX idx_attendance_session_se_device_id (se_device_id),
    INDEX idx_attendance_session_cs_id (cs_id),
    INDEX idx_attendance_session_se_secretary_id (se_secretary_id),
    CONSTRAINT fk_attendance_session_cs_id FOREIGN KEY (cs_id)
        REFERENCES class_section (cs_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_session_se_secretary_id FOREIGN KEY (se_secretary_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
