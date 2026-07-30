CREATE TABLE retention_risk (
    report_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    risk_category VARCHAR(50)  NOT NULL,
    remark        TEXT         NULL,
    sg_id         INT UNSIGNED NOT NULL,
    PRIMARY KEY (report_id),
    INDEX idx_retention_risk_sg_id (sg_id),
    CONSTRAINT fk_retention_risk_student_assessment_grade FOREIGN KEY (sg_id)
        REFERENCES student_assessment_grade (sg_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
