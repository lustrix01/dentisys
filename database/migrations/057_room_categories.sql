-- ROOM-001 (2026-11-06): categories are their own Dean-managed list, room names match ignoring
-- case, spaces, dashes and dots, and the starting list becomes CDM-1..3. Classes, meetings and
-- sessions keep room names as text and are not touched.
CREATE TABLE room_categories (
    category_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    name_key varchar(100) GENERATED ALWAYS AS (lower(regexp_replace(name, '[\s.\-]+', '', 'g'))) STORED,
    status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    retired_at timestamp(6),
    created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uq_room_categories_name_key UNIQUE (name_key),
    CONSTRAINT ck_room_categories_retired_at CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);

INSERT INTO room_categories (name)
SELECT min(group_name) FROM rooms GROUP BY lower(regexp_replace(group_name, '[\s.\-]+', '', 'g'));

ALTER TABLE rooms ADD COLUMN category_id bigint REFERENCES room_categories(category_id);
UPDATE rooms r SET category_id = c.category_id
  FROM room_categories c WHERE c.name_key = lower(regexp_replace(r.group_name, '[\s.\-]+', '', 'g'));

-- New matching key. A collision between existing rooms fails this migration (unique violation).
ALTER TABLE rooms DROP COLUMN name_key;
ALTER TABLE rooms ADD COLUMN name_key varchar(100) GENERATED ALWAYS AS (lower(regexp_replace(name, '[\s.\-]+', '', 'g'))) STORED;
ALTER TABLE rooms ADD CONSTRAINT uq_rooms_name_key UNIQUE (name_key);

-- Remove only the untouched 054 starting rooms, then their now-empty categories.
DELETE FROM rooms WHERE status = 'active' AND latitude IS NULL AND longitude IS NULL AND radius_meters IS NULL
  AND updated_at = created_at AND (name, group_name) IN (
    ('Lecture Hall A', 'Lecture Halls & Auditoriums'), ('Lecture Hall B', 'Lecture Halls & Auditoriums'), ('Auditorium', 'Lecture Halls & Auditoriums'),
    ('Dental Clinic Lab 1', 'Laboratories & Dental Clinics'), ('Dental Clinic Lab 2', 'Laboratories & Dental Clinics'),
    ('Oral Anatomy Lab', 'Laboratories & Dental Clinics'), ('Prosthodontics Lab', 'Laboratories & Dental Clinics'),
    ('Periodontics Lab', 'Laboratories & Dental Clinics'), ('Simulation Lab', 'Laboratories & Dental Clinics'),
    ('Room 101', 'Standard Classrooms'), ('Room 102', 'Standard Classrooms'), ('Room 201', 'Standard Classrooms'),
    ('Room 202', 'Standard Classrooms'), ('Room 301', 'Standard Classrooms'), ('Room 302', 'Standard Classrooms'));
DELETE FROM room_categories c WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r.category_id = c.category_id);

INSERT INTO room_categories (name) SELECT 'Lecture/Laboratory'
  WHERE NOT EXISTS (SELECT 1 FROM room_categories WHERE name_key = 'lecture/laboratory');
INSERT INTO rooms (name, group_name, category_id)
SELECT v.name, 'Lecture/Laboratory', (SELECT category_id FROM room_categories WHERE name_key = 'lecture/laboratory')
  FROM (VALUES ('CDM-1'), ('CDM-2'), ('CDM-3')) AS v(name)
 WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r.name_key = lower(regexp_replace(v.name, '[\s.\-]+', '', 'g')));

ALTER TABLE rooms ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE rooms DROP COLUMN group_name;
ALTER TABLE rooms DROP COLUMN used_before_rename;
CREATE INDEX idx_rooms_category ON rooms (category_id);
