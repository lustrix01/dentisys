-- CLS-003: Faculty archive a current-year class section. status is untouched.
ALTER TABLE class_sections
    ADD COLUMN archive_reason TEXT NULL,
    ADD COLUMN archived_at TIMESTAMP(6) NULL,
    ADD CONSTRAINT chk_class_sections_archive_reason
        CHECK (archive_reason IS NULL OR archive_reason IN ('finished', 'cancelled', 'mistake')),
    ADD CONSTRAINT chk_class_sections_archive_pair
        CHECK ((archive_reason IS NULL) = (archived_at IS NULL));
