-- ATT-006 (2026-10-28): every manual Secretary attendance change is a request that the
-- section's Faculty approve. A request now carries the status being asked for, and the
-- requesting Secretary can cancel a pending request. Existing rows stay Excused requests.
-- attendance_records.verification_method has no check constraint, so 'secretary_approved'
-- needs no schema change.
ALTER TABLE attendance_excused_requests
    ADD COLUMN IF NOT EXISTS requested_status TEXT NOT NULL DEFAULT 'excused';

ALTER TABLE attendance_excused_requests
    ADD CONSTRAINT ck_attendance_excused_requests_requested_status
    CHECK (requested_status IN ('present', 'late', 'absent', 'excused'));

ALTER TABLE attendance_excused_requests
    DROP CONSTRAINT ck_attendance_excused_requests_status;
ALTER TABLE attendance_excused_requests
    ADD CONSTRAINT ck_attendance_excused_requests_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
-- The decision check (status <> 'pending' needs decided_at and decided_by) already fits 'cancelled'.
