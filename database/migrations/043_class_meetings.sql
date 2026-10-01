-- New meetings are atomic. Legacy room/schedule text is retained verbatim
-- and interpreted only where its day/time boundaries are unambiguous.
ALTER TABLE class_sections ADD COLUMN meetings_recorded boolean NOT NULL DEFAULT false;
CREATE TABLE class_meetings (
    meeting_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cs_id bigint NOT NULL REFERENCES class_sections(cs_id),
    component varchar(10) NOT NULL CHECK (component IN ('Lecture', 'Laboratory')),
    weekday varchar(3) NOT NULL CHECK (weekday IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
    room varchar(100) NOT NULL CHECK (length(trim(room)) > 0),
    start_time time NOT NULL,
    end_time time NOT NULL CHECK (end_time > start_time),
    UNIQUE (cs_id, component, weekday, start_time)
);
CREATE INDEX ix_class_meetings_section ON class_meetings(cs_id);
