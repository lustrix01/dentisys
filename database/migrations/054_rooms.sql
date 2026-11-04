-- ROOM-001 (2026-11-05): Dean-managed room list. Classes, class meetings and sessions keep
-- saving the room name as text; nothing existing is rewritten and no foreign keys are added.
-- name_key is generated (lower, trimmed, inner spaces collapsed) so uniqueness and usage matching
-- share one rule across active and retired rooms.
CREATE TABLE rooms (
    room_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    name_key varchar(100) GENERATED ALWAYS AS (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) STORED,
    group_name varchar(100) NOT NULL CHECK (length(btrim(group_name)) > 0),
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    radius_meters double precision CHECK (radius_meters BETWEEN 50 AND 2000),
    status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    retired_at timestamp(6),
    created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uq_rooms_name_key UNIQUE (name_key),
    CONSTRAINT ck_rooms_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT ck_rooms_radius_needs_location CHECK (radius_meters IS NULL OR latitude IS NOT NULL),
    CONSTRAINT ck_rooms_retired_at CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);

INSERT INTO rooms (name, group_name) VALUES
    ('Lecture Hall A', 'Lecture Halls & Auditoriums'),
    ('Lecture Hall B', 'Lecture Halls & Auditoriums'),
    ('Auditorium', 'Lecture Halls & Auditoriums'),
    ('Dental Clinic Lab 1', 'Laboratories & Dental Clinics'),
    ('Dental Clinic Lab 2', 'Laboratories & Dental Clinics'),
    ('Oral Anatomy Lab', 'Laboratories & Dental Clinics'),
    ('Prosthodontics Lab', 'Laboratories & Dental Clinics'),
    ('Periodontics Lab', 'Laboratories & Dental Clinics'),
    ('Simulation Lab', 'Laboratories & Dental Clinics'),
    ('Room 101', 'Standard Classrooms'),
    ('Room 102', 'Standard Classrooms'),
    ('Room 201', 'Standard Classrooms'),
    ('Room 202', 'Standard Classrooms'),
    ('Room 301', 'Standard Classrooms'),
    ('Room 302', 'Standard Classrooms');
