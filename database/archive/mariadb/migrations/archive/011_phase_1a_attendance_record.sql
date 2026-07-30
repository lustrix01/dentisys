CREATE TABLE attendance_record (
    rec_id                      INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    sat_time_recorded           DATETIME(6)    NOT NULL,
    rec_status                  VARCHAR(50)    NOT NULL,
    rec_verification_method     VARCHAR(100)   NOT NULL,
    se_id                       INT UNSIGNED   NOT NULL,
    en_id                       INT UNSIGNED   NOT NULL,
    PRIMARY KEY (rec_id),
    INDEX idx_attendance_record_se_id (se_id),
    INDEX idx_attendance_record_en_id (en_id),
    CONSTRAINT fk_attendance_record_se_id FOREIGN KEY (se_id)
        REFERENCES attendance_session (se_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_record_en_id FOREIGN KEY (en_id)
        REFERENCES enrollment (en_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
