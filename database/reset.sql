-- =============================================================================
-- DentiSys Database Clear / Wipe Script
-- Clears all data from all 14 application tables and resets AUTO_INCREMENT.
-- Does NOT drop any tables.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE auth_sessions;
TRUNCATE TABLE security_tokens;
TRUNCATE TABLE audit_events;
TRUNCATE TABLE email_outbox;
TRUNCATE TABLE biometric_profiles;
TRUNCATE TABLE attendance_records;
TRUNCATE TABLE assessment_scores;
TRUNCATE TABLE assessments;
TRUNCATE TABLE enrollments;
TRUNCATE TABLE students;
TRUNCATE TABLE class_sections;
TRUNCATE TABLE courses;
TRUNCATE TABLE role_permissions;
TRUNCATE TABLE user_accounts;

SET FOREIGN_KEY_CHECKS = 1;
