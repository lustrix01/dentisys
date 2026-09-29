-- ATT-001 / ATT-003: every new attendance session has a class end time on
-- the session day, at or after the Late cutoff. When it passes, the session
-- ends automatically and students without a record are resolved to Absent.
-- Existing sessions keep NULL and are ended manually as before.
ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS class_end_time TIME NULL;

ALTER TABLE attendance_sessions
    DROP CONSTRAINT IF EXISTS ck_attendance_sessions_class_end_time;
ALTER TABLE attendance_sessions
    ADD CONSTRAINT ck_attendance_sessions_class_end_time
    CHECK (class_end_time IS NULL OR late_cutoff_time IS NULL OR class_end_time >= late_cutoff_time);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_active_class_end
    ON attendance_sessions (session_date, class_end_time)
    WHERE status = 'active';
