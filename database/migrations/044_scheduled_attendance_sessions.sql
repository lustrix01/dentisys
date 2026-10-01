-- One open session per class/date. Preserve legacy rows without an end time
-- without letting them block another calendar day's scheduled opening.
DROP INDEX uq_attendance_sessions_active_section;
CREATE UNIQUE INDEX uq_attendance_sessions_active_section_date
    ON attendance_sessions(cs_id, session_date) WHERE status = 'active';
ALTER TABLE attendance_sessions DROP CONSTRAINT ck_attendance_sessions_status;
ALTER TABLE attendance_sessions ADD CONSTRAINT ck_attendance_sessions_status
    CHECK (status IN ('scheduled', 'active', 'ended', 'revoked'));
ALTER TABLE attendance_sessions DROP CONSTRAINT ck_attendance_sessions_lifecycle;
ALTER TABLE attendance_sessions ADD CONSTRAINT ck_attendance_sessions_lifecycle CHECK (
    (status IN ('scheduled', 'active') AND ended_at IS NULL AND revoked_at IS NULL)
    OR (status = 'ended' AND ended_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
);
ALTER TABLE attendance_sessions ADD COLUMN created_by_role varchar(9)
    CHECK (created_by_role IN ('faculty', 'secretary'));
UPDATE attendance_sessions s SET created_by_role = CASE
    WHEN s.owner_user_id = cs.instructor_user_id THEN 'faculty' ELSE 'secretary' END
    FROM class_sections cs WHERE cs.cs_id = s.cs_id;
CREATE INDEX ix_attendance_sessions_scheduled ON attendance_sessions(session_date, opening_time)
    WHERE status = 'scheduled';
