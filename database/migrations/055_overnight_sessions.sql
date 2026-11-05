-- ATT-001 (2026-11-05): a session may end after midnight. Cutoffs and the class end that are
-- earlier than the opening time fall on the next day, and the whole session lasts under 24 hours.
-- The old CHECKs compare plain clock times, so they reject such sessions. They are replaced by one
-- CHECK that measures each time as the distance after the opening time (wrapping at 24 hours),
-- which keeps the same order rule: opening < Present cutoff < Late cutoff <= class end.
-- Existing rows already satisfy it (they never wrapped). Server validation stays the first line.
CREATE OR REPLACE FUNCTION attendance_offset_after_opening(t time, opening time) RETURNS interval AS $$
    SELECT CASE WHEN t >= opening THEN t - opening ELSE t - opening + INTERVAL '24 hours' END
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS ck_attendance_sessions_timing_order;
ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS ck_attendance_sessions_class_end_time;
ALTER TABLE attendance_sessions ADD CONSTRAINT ck_attendance_sessions_timing_order CHECK (
    (opening_time IS NULL AND present_cutoff_time IS NULL AND late_cutoff_time IS NULL)
    OR (opening_time IS NOT NULL AND present_cutoff_time IS NOT NULL AND late_cutoff_time IS NOT NULL
        AND INTERVAL '0' < attendance_offset_after_opening(present_cutoff_time, opening_time)
        AND attendance_offset_after_opening(present_cutoff_time, opening_time) < attendance_offset_after_opening(late_cutoff_time, opening_time)
        AND (class_end_time IS NULL
             OR attendance_offset_after_opening(late_cutoff_time, opening_time) <= attendance_offset_after_opening(class_end_time, opening_time)))
);
