CREATE TABLE retention_risk (
    risk_id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    risk_level          VARCHAR(50)    NOT NULL,
    risk_confidence     DECIMAL(5,4)   NOT NULL,
    rr_timestamp        DATETIME(6)    NOT NULL,
    student_id          INT UNSIGNED   NOT NULL,
    PRIMARY KEY (risk_id),
    INDEX idx_retention_risk_student_id (student_id),
    CONSTRAINT fk_retention_risk_student_id FOREIGN KEY (student_id)
        REFERENCES student (student_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
