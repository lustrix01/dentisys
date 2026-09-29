-- Optional Faculty notes on each remedial attempt (Owner decision
-- 2026-09-29). Existing attempts keep NULL notes.
ALTER TABLE enrollment_remedial_attempts
    ADD COLUMN IF NOT EXISTS notes VARCHAR(500) NULL;
