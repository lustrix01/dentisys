-- =============================================================================
-- DentiSys Migration 004: PHPMailer Email Logs, Class Sessions & Consent Fields
-- =============================================================================

-- 1. email_log Table
CREATE TABLE IF NOT EXISTS email_log (
    email_log_id      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    recipient_email   VARCHAR(255)    NOT NULL,
    subject           VARCHAR(500)    NOT NULL,
    email_type        VARCHAR(100)    NOT NULL,
    status            ENUM('Sent', 'Failed') NOT NULL,
    timestamp         DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    error_message     TEXT            NULL,
    PRIMARY KEY (email_log_id),
    INDEX idx_email_log_recipient (recipient_email),
    INDEX idx_email_log_status (status),
    INDEX idx_email_log_type (email_type),
    INDEX idx_email_log_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. class_sessions Table
CREATE TABLE IF NOT EXISTS class_sessions (
    session_id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    cs_id                INT UNSIGNED    NOT NULL,
    academic_term        VARCHAR(50)     NOT NULL DEFAULT '2025-2026 2ND',
    subject_code         VARCHAR(100)    NOT NULL DEFAULT 'DENT-401',
    subject_title        VARCHAR(255)    NOT NULL DEFAULT 'Clinical Dentistry I',
    session_date         DATE            NOT NULL,
    start_time           TIME            NOT NULL DEFAULT '08:00:00',
    end_time             TIME            NOT NULL DEFAULT '11:00:00',
    room                 VARCHAR(100)    NOT NULL DEFAULT 'Lab 201',
    status               ENUM('scheduled','active','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    secretary_student_id INT UNSIGNED    NULL,
    assigned_by          INT UNSIGNED    NULL,
    assigned_at          DATETIME(6)     NULL,
    notification_sent    TINYINT(1)      NOT NULL DEFAULT 0,
    notification_sent_at DATETIME(6)     NULL,
    created_at           DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (session_id),
    CONSTRAINT fk_class_sess_cs FOREIGN KEY (cs_id)
        REFERENCES class_sections (cs_id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT,
    CONSTRAINT fk_class_sess_student FOREIGN KEY (secretary_student_id)
        REFERENCES students (student_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    CONSTRAINT fk_class_sess_assigned_by FOREIGN KEY (assigned_by)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_class_sess_cs (cs_id),
    INDEX idx_class_sess_status (status),
    INDEX idx_class_sess_secretary (secretary_student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Additional Consent Tracking Fields in biometric_profiles
ALTER TABLE biometric_profiles
    ADD COLUMN IF NOT EXISTS consent_ip VARCHAR(45) NULL,
    ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20) NULL DEFAULT '1.0';
