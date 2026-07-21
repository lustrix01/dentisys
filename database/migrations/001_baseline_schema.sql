-- =============================================================================
-- DentiSys Baseline Schema — 15 Application Tables + seed infrastructure
-- Stage 1: Clean database only. No users, passwords, tokens, or secrets.
-- Table order ensures all FK targets exist before their dependents.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_accounts
-- Central identity: credentials, role, profile, preferences, account state.
-- No foreign keys.
-- ---------------------------------------------------------------------------
CREATE TABLE user_accounts (
    user_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    login_email      VARCHAR(255)    NOT NULL,
    password_hash    VARCHAR(255)    NOT NULL,
    role             ENUM('admin','faculty','secretary') NOT NULL,
    display_name     VARCHAR(255)    NOT NULL,
    title            VARCHAR(255)    NULL,
    status           VARCHAR(20)     NOT NULL DEFAULT 'Active',
    token_version    INT UNSIGNED    NOT NULL DEFAULT 0,
    theme            ENUM('light','dark') NOT NULL DEFAULT 'light',
    created_at       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6)     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
    approved_at      DATETIME(6)     NULL,
    rejected_at      DATETIME(6)     NULL,
    disabled_at      DATETIME(6)     NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT uq_user_accounts_login_email UNIQUE (login_email),
    INDEX idx_user_accounts_role (role),
    INDEX idx_user_accounts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 2. role_permissions
-- Denormalized RBAC policy.  Missing rows = deny.
-- No foreign keys.
-- ---------------------------------------------------------------------------
CREATE TABLE role_permissions (
    rp_id      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    role_name  ENUM('admin','faculty','secretary') NOT NULL,
    resource   VARCHAR(100)    NOT NULL,
    action     VARCHAR(50)     NOT NULL,
    scope      ENUM('own','assigned_class','assigned_course','aggregate','system_wide') NOT NULL,
    PRIMARY KEY (rp_id),
    CONSTRAINT uq_role_permissions UNIQUE (role_name, resource, action, scope),
    INDEX idx_role_permissions_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 3. courses
-- Course catalog with grading component configuration stored as JSON.
-- No foreign keys (FKs inbound from class_sections).
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
    course_id    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    course_code  VARCHAR(50)     NOT NULL,
    name         VARCHAR(255)    NOT NULL,
    units        DECIMAL(3,1)    NOT NULL,
    year_level   TINYINT UNSIGNED NULL,
    semester     ENUM('1ST','2ND','Summer') NULL,
    description  TEXT            NULL,
    is_clinical  TINYINT(1)      NOT NULL DEFAULT 0,
    grading_config JSON          NOT NULL,
    has_zero_rule TINYINT(1)     NOT NULL DEFAULT 0,
    created_at   DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (course_id),
    CONSTRAINT uq_courses_course_code UNIQUE (course_code),
    INDEX idx_courses_year_level (year_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 4. class_sections
-- A course offering: one course taught by one instructor in one term, with
-- an optional assigned secretary.
-- FKs: courses (must exist), user_accounts (must exist).
-- ---------------------------------------------------------------------------
CREATE TABLE class_sections (
    cs_id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    cs_name           VARCHAR(255)    NOT NULL,
    course_id         INT UNSIGNED    NOT NULL,
    instructor_user_id INT UNSIGNED   NOT NULL,
    secretary_user_id INT UNSIGNED    NULL,
    semester          ENUM('1ST','2ND','Summer') NOT NULL,
    school_year       VARCHAR(20)     NOT NULL,
    year_level        TINYINT UNSIGNED NULL,
    lab_room          VARCHAR(100)    NULL,
    lec_room          VARCHAR(100)    NULL,
    block             VARCHAR(50)     NULL,
    status            VARCHAR(20)     NOT NULL DEFAULT 'Active',
    term_code         VARCHAR(50)     NULL,
    term_start_date   DATE            NULL,
    term_end_date     DATE            NULL,
    created_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (cs_id),
    CONSTRAINT fk_cs_course FOREIGN KEY (course_id)
        REFERENCES courses (course_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_cs_instructor FOREIGN KEY (instructor_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_cs_secretary FOREIGN KEY (secretary_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_cs_course (course_id),
    INDEX idx_cs_instructor (instructor_user_id),
    INDEX idx_cs_secretary (secretary_user_id),
    INDEX idx_cs_school_year (school_year),
    INDEX idx_cs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 5. students
-- Student identity, demographics, and optional link to a user account.
-- students.user_id is the authoritative link when a student is activated as
-- a Class Secretary.
-- FK: user_accounts (nullable).
-- ---------------------------------------------------------------------------
CREATE TABLE students (
    student_id     INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    student_number VARCHAR(50)     NOT NULL,
    first_name     VARCHAR(100)    NOT NULL,
    last_name      VARCHAR(100)    NOT NULL,
    middle_name    VARCHAR(100)    NULL,
    bu_email       VARCHAR(255)    NULL,
    contact        VARCHAR(50)     NULL,
    sex            CHAR(1)         NULL,
    year_level     TINYINT UNSIGNED NULL,
    status         ENUM('active','disabled','archived') NOT NULL DEFAULT 'active',
    admission_date DATE            NULL,
    birthdate      DATE            NULL,
    user_id        INT UNSIGNED    NULL,
    created_at     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6)     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (student_id),
    CONSTRAINT uq_students_student_number UNIQUE (student_number),
    CONSTRAINT uq_students_user_id UNIQUE (user_id),
    CONSTRAINT fk_students_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_students_year_level (year_level),
    INDEX idx_students_status (status),
    INDEX idx_students_last_name (last_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 6. enrollments
-- One row = one student enrolled in one class-section (course offering).
-- Holds grade, retention state, and remedial state for that offering only.
-- FKs: students, class_sections.
-- ---------------------------------------------------------------------------
CREATE TABLE enrollments (
    enrollment_id     INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    student_id        INT UNSIGNED    NOT NULL,
    cs_id             INT UNSIGNED    NOT NULL,
    status            VARCHAR(20)     NOT NULL DEFAULT 'Active',
    date_enrolled     DATE            NULL,
    final_percentage  DECIMAL(5,2)    NULL,
    final_gwa         DECIMAL(4,2)    NULL,
    grade_components_json JSON        NULL,
    retention_state   ENUM('active','warning','critical','remedial','archived') NOT NULL DEFAULT 'active',
    remedial_state_json JSON          NULL,
    clinic_hours_completed INT UNSIGNED NOT NULL DEFAULT 0,
    created_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at        DATETIME(6)     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (enrollment_id),
    CONSTRAINT uq_enrollments_student_cs UNIQUE (student_id, cs_id),
    CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id)
        REFERENCES students (student_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_enrollments_cs FOREIGN KEY (cs_id)
        REFERENCES class_sections (cs_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    INDEX idx_enrollments_student (student_id),
    INDEX idx_enrollments_cs (cs_id),
    INDEX idx_enrollments_retention_state (retention_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 7. assessments
-- Assessment/activity definitions for a class-section.
-- FK: class_sections.
-- ---------------------------------------------------------------------------
CREATE TABLE assessments (
    assessment_id  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    cs_id          INT UNSIGNED    NOT NULL,
    title          VARCHAR(255)    NOT NULL,
    type           ENUM('Quiz','Activity','Assignment','Laboratory','Midterm Exam','Final Exam','Others') NOT NULL,
    grading_period ENUM('Midterm','Final') NULL,
    max_score      DECIMAL(6,2)    NOT NULL,
    weight         DECIMAL(5,2)    NULL,
    due_date       DATE            NULL,
    instructions   TEXT            NULL,
    status         ENUM('Active','Closed','Archived') NOT NULL DEFAULT 'Active',
    created_at     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6)     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (assessment_id),
    CONSTRAINT fk_assessments_cs FOREIGN KEY (cs_id)
        REFERENCES class_sections (cs_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    INDEX idx_assessments_cs (cs_id),
    INDEX idx_assessments_status (status),
    INDEX idx_assessments_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 8. assessment_scores
-- Individual student scores for an assessment.
-- FKs: assessments, students.
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_scores (
    score_id      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    assessment_id INT UNSIGNED    NOT NULL,
    student_id    INT UNSIGNED    NOT NULL,
    score         DECIMAL(6,2)    NOT NULL,
    submitted_at  DATETIME(6)     NULL,
    remarks       VARCHAR(500)    NULL,
    PRIMARY KEY (score_id),
    CONSTRAINT uq_assessment_scores UNIQUE (assessment_id, student_id),
    CONSTRAINT fk_scores_assessment FOREIGN KEY (assessment_id)
        REFERENCES assessments (assessment_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_scores_student FOREIGN KEY (student_id)
        REFERENCES students (student_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    INDEX idx_assessment_scores_assessment (assessment_id),
    INDEX idx_assessment_scores_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 9. attendance_records
-- Per-student attendance for a session, with override fields.
-- FKs: enrollments (authoritative relationship), user_accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_records (
    record_id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    enrollment_id       INT UNSIGNED    NOT NULL,
    session_date        DATE            NOT NULL,
    session_code        VARCHAR(100)    NULL,
    session_start       TIME            NULL,
    session_end         TIME            NULL,
    status              ENUM('present','absent','late','excused') NOT NULL,
    verification_method VARCHAR(50)     NULL,
    device_id           VARCHAR(50)     NULL,
    secretary_user_id   INT UNSIGNED    NULL,
    override_reason     VARCHAR(500)    NULL,
    override_by_user_id INT UNSIGNED    NULL,
    override_at         DATETIME(6)     NULL,
    time_recorded       DATETIME(6)     NULL,
    created_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (record_id),
    CONSTRAINT uq_attendance_enrollment_date_code UNIQUE (enrollment_id, session_date, session_code),
    CONSTRAINT fk_att_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollments (enrollment_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_att_secretary FOREIGN KEY (secretary_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    CONSTRAINT fk_att_override_by FOREIGN KEY (override_by_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_attendance_enrollment (enrollment_id),
    INDEX idx_attendance_session_date (session_date),
    INDEX idx_attendance_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 10. biometric_profiles
-- One row per student.  Protected template/image references.
-- Consent status.  Revocation clears template and image references.
-- FKs: students, user_accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE biometric_profiles (
    profile_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    student_id          INT UNSIGNED    NOT NULL,
    consent_status      ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
    face_enrolled       TINYINT(1)      NOT NULL DEFAULT 0,
    template_reference  VARCHAR(500)    NULL,
    image_references    JSON            NULL,
    enrolled_at         DATETIME(6)     NULL,
    consent_responded_at DATETIME(6)    NULL,
    revoked_at          DATETIME(6)     NULL,
    revoked_by_user_id  INT UNSIGNED    NULL,
    recorded_by_user_id INT UNSIGNED    NULL,
    created_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6)     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (profile_id),
    CONSTRAINT uq_biometric_profiles_student UNIQUE (student_id),
    CONSTRAINT fk_bio_student FOREIGN KEY (student_id)
        REFERENCES students (student_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_bio_revoked_by FOREIGN KEY (revoked_by_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    CONSTRAINT fk_bio_recorded_by FOREIGN KEY (recorded_by_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_biometric_consent (consent_status),
    INDEX idx_biometric_face_enrolled (face_enrolled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE: Revocation clears template_reference and image_references in
-- application code; triggers are not used for the clearance to avoid
-- cross-row storage operations in constraint enforcement.


-- ---------------------------------------------------------------------------
-- 11. auth_sessions
-- Session identity and lifecycle only.
-- issued_token_version enables account-wide invalidation.
-- Refresh-token digests and lineage are stored in security_tokens.
-- FK: user_accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE auth_sessions (
    session_id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    session_uuid         CHAR(36)        NOT NULL,
    user_id              INT UNSIGNED    NOT NULL,
    issued_token_version INT UNSIGNED    NOT NULL,
    ip_address           VARCHAR(45)     NULL,
    user_agent           VARCHAR(512)    NULL,
    device_id            VARCHAR(100)    NULL,
    last_seen_at         DATETIME(6)     NULL,
    created_at           DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at           DATETIME(6)     NOT NULL,
    revoked_at           DATETIME(6)     NULL,
    revocation_reason    VARCHAR(500)    NULL,
    PRIMARY KEY (session_id),
    CONSTRAINT uq_auth_sessions_session_uuid UNIQUE (session_uuid),
    CONSTRAINT fk_session_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    INDEX idx_auth_sessions_user (user_id),
    INDEX idx_auth_sessions_expires (expires_at),
    INDEX idx_auth_sessions_revoked (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 12. security_tokens
-- Universal token store with purpose discriminator.
-- Nullable columns accommodate purpose-specific shapes.
-- FKs: user_accounts (nullable), auth_sessions, self(parent), students, cs.
-- ---------------------------------------------------------------------------
CREATE TABLE security_tokens (
    token_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    purpose           ENUM('mfa_credential','mfa_recovery','password_reset','access_token_blacklist','secretary_invitation','refresh') NOT NULL,
    user_id           INT UNSIGNED    NULL,
    session_id        INT UNSIGNED    NULL,
    related_student_id INT UNSIGNED   NULL,
    related_cs_id     INT UNSIGNED    NULL,
    token_digest      BINARY(32)      NULL,
    secret_hash       VARCHAR(255)    NULL,
    family_uuid       CHAR(36)        NULL,
    parent_token_id   INT UNSIGNED    NULL,
    issued_at         DATETIME(6)     NULL,
    expires_at        DATETIME(6)     NULL,
    used_at           DATETIME(6)     NULL,
    revoked_at        DATETIME(6)     NULL,
    revocation_reason VARCHAR(500)    NULL,
    ciphertext        VARBINARY(255)  NULL,
    nonce             VARBINARY(16)   NULL,
    auth_tag          VARBINARY(16)   NULL,
    enc_key_version   INT UNSIGNED    NULL DEFAULT 1,
    enc_algorithm     VARCHAR(20)     NULL DEFAULT 'AES-256-GCM',
    totp_algorithm    VARCHAR(10)     NULL,
    digit_count       TINYINT UNSIGNED NULL,
    period_seconds    INT UNSIGNED    NULL,
    mfa_status        VARCHAR(20)     NULL,
    mfa_verified_at   DATETIME(6)     NULL,
    last_accepted_step BIGINT UNSIGNED NULL,
    metadata_json     JSON            NULL,
    PRIMARY KEY (token_id),
    CONSTRAINT uq_security_tokens_token_digest UNIQUE (token_digest),
    CONSTRAINT uq_security_tokens_parent_token_id UNIQUE (parent_token_id),
    CONSTRAINT fk_stoken_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_stoken_session FOREIGN KEY (session_id)
        REFERENCES auth_sessions (session_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_stoken_parent FOREIGN KEY (parent_token_id)
        REFERENCES security_tokens (token_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_stoken_related_student FOREIGN KEY (related_student_id)
        REFERENCES students (student_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_stoken_related_cs FOREIGN KEY (related_cs_id)
        REFERENCES class_sections (cs_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    INDEX idx_stoken_user_purpose (user_id, purpose),
    INDEX idx_stoken_digest (token_digest),
    INDEX idx_stoken_session (session_id),
    INDEX idx_stoken_family (family_uuid),
    INDEX idx_stoken_expires (expires_at),
    INDEX idx_stoken_related_student (related_student_id),
    INDEX idx_stoken_related_cs (related_cs_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE: token_digest and parent_token_id are nullable UNIQUE constraints.
-- MariaDB permits multiple NULL values in a UNIQUE column.
-- Cross-row application invariants (one active MFA per user, one pending
-- secretary invitation per student+cs) are enforced in application code.


-- ---------------------------------------------------------------------------
-- 13. audit_events
-- Append-only, tamper-evident audit trail with HMAC-SHA-256 chaining.
-- BEFORE UPDATE / BEFORE DELETE triggers enforce immutability.
-- FKs: user_accounts (SET NULL), auth_sessions (SET NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
    event_id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    event_uuid            CHAR(36)        NOT NULL,
    sequence_number       BIGINT UNSIGNED NOT NULL,
    occurred_at           DATETIME(6)     NOT NULL,
    actor_user_id         INT UNSIGNED    NULL,
    actor_username        VARCHAR(255)    NULL,
    actor_role            VARCHAR(50)     NULL,
    actor_display_name    VARCHAR(255)    NULL,
    session_id            INT UNSIGNED    NULL,
    module_code           VARCHAR(100)    NOT NULL,
    action_code           VARCHAR(100)    NOT NULL,
    event_status          ENUM('Success','Failed','Warning') NOT NULL,
    target_type           VARCHAR(100)    NULL,
    target_id             VARCHAR(255)    NULL,
    description           TEXT            NULL,
    reason                VARCHAR(500)    NULL,
    http_method           VARCHAR(10)     NULL,
    endpoint              VARCHAR(255)    NULL,
    request_id            VARCHAR(100)    NULL,
    correlation_id        VARCHAR(100)    NULL,
    operation_uuid        CHAR(36)        NULL,
    ip_address            VARCHAR(45)     NULL,
    user_agent            VARCHAR(512)    NULL,
    device_id             VARCHAR(100)    NULL,
    device_name           VARCHAR(255)    NULL,
    before_state_json     LONGTEXT        NULL,
    after_state_json      LONGTEXT        NULL,
    before_state_hash     BINARY(32)      NULL,
    after_state_hash      BINARY(32)      NULL,
    previous_event_mac    BINARY(32)      NOT NULL,
    event_mac             BINARY(32)      NOT NULL,
    mac_key_version       INT UNSIGNED    NOT NULL,
    canonical_schema_version INT UNSIGNED NOT NULL,
    PRIMARY KEY (event_id),
    CONSTRAINT uq_audit_events_event_uuid UNIQUE (event_uuid),
    CONSTRAINT uq_audit_events_sequence UNIQUE (sequence_number),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    CONSTRAINT fk_audit_session FOREIGN KEY (session_id)
        REFERENCES auth_sessions (session_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_audit_events_occurred_at (occurred_at),
    INDEX idx_audit_events_actor (actor_user_id),
    INDEX idx_audit_events_module (module_code),
    INDEX idx_audit_events_status (event_status),
    INDEX idx_audit_events_operation_uuid (operation_uuid),
    INDEX idx_audit_events_target (target_type, target_id(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_events is append-only; UPDATE is not permitted';
END$$

CREATE TRIGGER trg_audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_events is append-only; DELETE is not permitted';
END$$

DELIMITER ;


-- ---------------------------------------------------------------------------
-- 14. email_outbox
-- Outgoing email queue with delivery status.
-- FK: user_accounts (SET NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE email_outbox (
    email_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    sender_user_id    INT UNSIGNED    NULL,
    recipient_email   VARCHAR(255)    NOT NULL,
    recipient_name    VARCHAR(255)    NULL,
    subject           VARCHAR(500)    NOT NULL,
    email_type        ENUM('Privacy Consent','At-Risk Notification','Secretary Invitation','Faculty Registration Approved','Faculty Registration Rejected','Other') NOT NULL,
    message_body      TEXT            NULL,
    status            ENUM('Pending','Sent','Failed') NOT NULL DEFAULT 'Pending',
    sent_at           DATETIME(6)     NULL,
    failure_reason    TEXT            NULL,
    operation_uuid    CHAR(36)        NOT NULL,
    created_at        DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (email_id),
    CONSTRAINT uq_email_outbox_operation_uuid UNIQUE (operation_uuid),
    CONSTRAINT fk_email_sender FOREIGN KEY (sender_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_email_outbox_status (status),
    INDEX idx_email_outbox_recipient (recipient_email),
    INDEX idx_email_outbox_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 15. system_settings
-- Global key-value configuration store.
-- is_internal marks rows reserved for system use (e.g., audit chain head).
-- FK: user_accounts (SET NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE system_settings (
    setting_id        INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    setting_key       VARCHAR(100)    NOT NULL,
    setting_value     JSON            NOT NULL,
    is_internal       TINYINT(1)      NOT NULL DEFAULT 0,
    description       VARCHAR(500)    NULL,
    updated_at        DATETIME(6)     NULL,
    updated_by_user_id INT UNSIGNED   NULL,
    PRIMARY KEY (setting_id),
    CONSTRAINT uq_system_settings_key UNIQUE (setting_key),
    CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by_user_id)
        REFERENCES user_accounts (user_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT,
    INDEX idx_system_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_system_settings_internal_no_delete
BEFORE DELETE ON system_settings
FOR EACH ROW
BEGIN
    IF OLD.is_internal = 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Internal system_settings rows cannot be deleted';
    END IF;
END$$

CREATE TRIGGER trg_system_settings_internal_identity_guard
BEFORE UPDATE ON system_settings
FOR EACH ROW
BEGIN
    IF OLD.is_internal = 1 THEN
        IF NEW.setting_key <> OLD.setting_key OR NEW.is_internal = 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Internal system_settings identity (setting_key, is_internal) is immutable';
        END IF;
    END IF;
END$$

DELIMITER ;
