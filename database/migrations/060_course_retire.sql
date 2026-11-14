-- ADM-001 (2026-11-14): the Dean can retire a course. A retired course leaves the Faculty course picker and
-- cannot be typed again when creating a class; existing class sections keep it. Nothing is deleted.
-- Copies the rooms pattern (054_rooms.sql): status + retired_at with a pairing check.
ALTER TABLE courses
    ADD COLUMN status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    ADD COLUMN retired_at timestamp(6),
    ADD CONSTRAINT ck_courses_retired_at CHECK ((status = 'retired') = (retired_at IS NOT NULL));
