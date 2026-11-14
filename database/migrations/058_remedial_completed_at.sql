-- Real completion date for each remedial attempt: set once when the result
-- moves from pending to passed/failed. Older
-- attempts keep NULL; the Faculty Remedial Record then shows Last updated.
ALTER TABLE enrollment_remedial_attempts
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(6) NULL;
