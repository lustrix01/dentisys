-- GRD-004 / UI-003 (12.12 + 12.13): Midterm advisory publish state and snapshot on class_sections. Additive only.
ALTER TABLE class_sections
    ADD COLUMN IF NOT EXISTS midterm_published_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS midterm_published_by INTEGER NULL REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS midterm_published_snapshot JSONB NULL;

-- Backfill midterm_published_at only for active current-year periods-mode classes that already sent a Midterm Advisory email.
-- Snapshot stays NULL so readers fall back to the published snapshot query until Faculty updates or unpublishes.
-- Current-year unsubmitted classes with existing remedial attempts are intentionally NOT auto-submitted.
UPDATE class_sections cs
   SET midterm_published_at = sub.earliest_sent_at,
       midterm_published_by = cs.instructor_user_id
  FROM (
      SELECT cs2.cs_id,
             MIN(COALESCE(eo.sent_at, eo.created_at)) AS earliest_sent_at
        FROM class_sections cs2
        JOIN courses c ON c.course_id = cs2.course_id
        JOIN grading_configs gc
          ON gc.faculty_user_id = cs2.instructor_user_id
         AND gc.course_id = cs2.course_id
         AND gc.semester = UPPER(cs2.semester)
         AND gc.school_year = UPPER(cs2.school_year)
         AND gc.schema_mode = 'periods'
        JOIN email_outbox eo
          ON eo.sender_user_id = cs2.instructor_user_id
         AND eo.email_type = 'Midterm Advisory'
         AND eo.status = 'Sent'
         AND lower(eo.subject) IN (
             lower('Midterm Academic Advisory: ' || cs2.cs_name),
             lower('Midterm Academic Advisory: ' || c.course_code || ' · ' || cs2.cs_name)
         )
         AND EXISTS (
             SELECT 1
               FROM enrollments e
               JOIN students s ON s.student_id = e.student_id
              WHERE e.cs_id = cs2.cs_id
                AND lower(s.bu_email) = lower(eo.recipient_email)
         )
       WHERE cs2.grades_submitted_at IS NULL
         AND cs2.archive_reason IS NULL
         AND cs2.midterm_published_at IS NULL
         AND cs2.school_year = (
             SELECT COALESCE(setting_value::jsonb ->> 'schoolYear', setting_value::jsonb ->> 'school_year', setting_value::jsonb #>> '{}')
               FROM system_settings
              WHERE setting_key = 'academic.current_school_year'
              LIMIT 1
         )
       GROUP BY cs2.cs_id
  ) sub
 WHERE cs.cs_id = sub.cs_id;
