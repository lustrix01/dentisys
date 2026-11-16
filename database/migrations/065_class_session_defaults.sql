-- ATT-001 (backlog 12.3a): each class remembers its grace periods and the face / geofence choices that fill Start session.
-- Additive: five columns with defaults, so existing classes behave as before (opening 15 min before the meeting, Present +30, Late +45 from the opening, face on, geofence off).
ALTER TABLE class_sections
    ADD COLUMN present_grace_minutes INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN late_grace_minutes INTEGER NOT NULL DEFAULT 45,
    ADD COLUMN session_biometric_required BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN session_geofence_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN session_geofence_radius INTEGER NOT NULL DEFAULT 100,
    ADD CONSTRAINT ck_class_sections_grace CHECK (present_grace_minutes >= 1 AND present_grace_minutes < late_grace_minutes AND late_grace_minutes <= 720),
    ADD CONSTRAINT ck_class_sections_session_radius CHECK (session_geofence_radius BETWEEN 50 AND 2000);
