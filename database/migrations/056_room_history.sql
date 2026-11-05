-- ROOM-001 (2026-11-05): a rename leaves sessions that already ran on the old name, so usage
-- counts under the new name drop to 0. This flag remembers that the room was used before a rename,
-- so a retired room that was ever used can never be deleted.
ALTER TABLE rooms ADD COLUMN used_before_rename boolean NOT NULL DEFAULT FALSE;
