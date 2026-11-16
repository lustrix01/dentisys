-- ATT-008 (backlog 12.3b): sessions created from a class's weekly schedule.
-- Additive. A class opts in; each auto-session remembers which meeting slot and which meeting date it came from,
-- so a revoked or edited one is never created again (even after class_meetings_save re-inserts the meetings).
ALTER TABLE class_sections
    ADD COLUMN auto_sessions_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN auto_sessions_topped_up_on DATE;

ALTER TABLE attendance_sessions
    ADD COLUMN auto_slot VARCHAR(40),
    ADD COLUMN auto_meeting_date DATE,
    ADD COLUMN auto_edited BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT ck_attendance_sessions_auto_pair CHECK ((auto_slot IS NULL) = (auto_meeting_date IS NULL));

-- One auto-session per class, meeting date and slot, whatever its status: a revoked one blocks re-creation.
CREATE UNIQUE INDEX uq_attendance_sessions_auto_slot
    ON attendance_sessions(cs_id, auto_meeting_date, auto_slot) WHERE auto_slot IS NOT NULL;

-- The lazy daily top-up asks only for classes that are on and not yet topped up today.
CREATE INDEX ix_class_sections_auto_sessions_due
    ON class_sections(auto_sessions_topped_up_on) WHERE auto_sessions_enabled;
