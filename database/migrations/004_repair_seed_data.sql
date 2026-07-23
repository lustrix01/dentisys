-- DentiSys corrective data migration.
-- Idempotent: every mutation is scoped to deterministic development fixtures.
-- Run backend/scripts/repair_data.php --dry-run first to create an impact report.

DELIMITER $$

DROP PROCEDURE IF EXISTS dentisys_repair_seed_data$$
CREATE PROCEDURE dentisys_repair_seed_data()
BEGIN
    DECLARE fixture_audit_count BIGINT DEFAULT 0;
    DECLARE other_audit_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO fixture_audit_count
      FROM audit_events
     WHERE event_uuid LIKE 'a0000000-0000-4000-8000-%'
       AND request_id LIKE 'req-%'
       AND user_agent = 'Mozilla/5.0 DentiSys Client';

    SELECT COUNT(*) INTO other_audit_count
      FROM audit_events
     WHERE NOT (
        event_uuid LIKE 'a0000000-0000-4000-8000-%'
        AND request_id LIKE 'req-%'
        AND user_agent = 'Mozilla/5.0 DentiSys Client'
     );

    IF fixture_audit_count > 0 AND other_audit_count > 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Mixed fixture/runtime audit history detected; repair aborted before mutation.';
    END IF;

    START TRANSACTION;

    UPDATE user_accounts
       SET display_name = 'Bea Alonzo',
           login_email = 'secretary@bicol-u.edu.ph',
           title = 'Class Secretary - CLINIC-4B'
     WHERE user_id = 9
       AND role = 'secretary';

    UPDATE students
       SET user_id = NULL
     WHERE student_id = 10
       AND user_id = 9;

    UPDATE students
       SET first_name = 'Bea',
           middle_name = NULL,
           last_name = 'Alonzo',
           bu_email = 'secretary@bicol-u.edu.ph',
           user_id = 9
     WHERE student_id = 24
       AND student_number = '2024-DENT-0024';

    UPDATE class_sections
       SET secretary_user_id = NULL
     WHERE cs_id = 7
       AND secretary_user_id = 9;

    UPDATE class_sections
       SET secretary_user_id = 9
     WHERE cs_id = 8
       AND cs_name = 'CLINIC-4B';

    UPDATE attendance_records r
      JOIN enrollments e ON e.enrollment_id = r.enrollment_id
       SET r.secretary_user_id = NULL
     WHERE r.secretary_user_id = 9
       AND e.cs_id <> 8;

    UPDATE students
       SET first_name = REPLACE(first_name, 'GutiÃ©rrez', 'Gutiérrez'),
           middle_name = REPLACE(middle_name, 'GutiÃ©rrez', 'Gutiérrez'),
           last_name = REPLACE(last_name, 'GutiÃ©rrez', 'Gutiérrez'),
           bu_email = REPLACE(bu_email, 'gutiérrez', 'gutierrez')
     WHERE CONCAT_WS(' ', first_name, middle_name, last_name) LIKE '%GutiÃ©rrez%'
        OR bu_email LIKE '%gutiérrez%';

    UPDATE biometric_profiles
       SET face_enrolled = 0,
           template_reference = NULL,
           image_references = NULL,
           enrolled_at = NULL
     WHERE template_reference LIKE 'facenet_v2_vector_%'
        OR image_references LIKE '%/uploads/faces/student_%';

    DELETE FROM email_outbox
     WHERE operation_uuid LIKE 'e0000000-0000-4000-8000-%'
       AND recipient_email LIKE 'student\_%@bicol-u.edu.ph'
       AND subject = 'Official Academic Notice - DentiSys';

    UPDATE system_settings
       SET setting_value = JSON_OBJECT('configured', false, 'registry', JSON_ARRAY()),
           description = 'Optional device registry. No CCTV or biometric integration is configured by default.'
     WHERE setting_key = 'devices';

    COMMIT;

    -- Audit fixtures are intentionally not deleted by an automatic migration.
    -- The maintenance CLI performs that exceptional operation with a backup,
    -- a mixed-history guard, and trigger recreation in a finally block.
END$$

DELIMITER ;

CALL dentisys_repair_seed_data();
DROP PROCEDURE dentisys_repair_seed_data;
