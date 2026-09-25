-- Recreate the linked-attendance validation trigger so changing an existing
-- record's enrollment cannot bypass the session/class consistency check.
-- The attendance-session reference remains nullable for preserved historical
-- snapshots, and the existing SQLSTATE/FK behavior is unchanged.

DROP TRIGGER IF EXISTS trg_validate_attendance_session_reference ON attendance_records;

CREATE TRIGGER trg_validate_attendance_session_reference
BEFORE INSERT OR UPDATE OF attendance_session_id, enrollment_id, session_date, session_code
ON attendance_records
FOR EACH ROW EXECUTE FUNCTION validate_attendance_session_reference();
