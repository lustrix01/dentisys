-- BIO-002 / BIO-009 (backlog 12.9): Student face revocation approval queue, blocked mismatch updates (F2), and repeat-revoke flagging (F3).
-- Additive migration: expand face_enrolment_flags.kind to ('F1', 'F2', 'F3') and add face_revoke_requests.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = current_schema()
           AND t.relname = 'face_enrolment_flags'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ~* '\mkind\M'
    LOOP
        EXECUTE format('ALTER TABLE face_enrolment_flags DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE face_enrolment_flags
    ADD CONSTRAINT face_enrolment_flags_kind_check CHECK (kind IN ('F1', 'F2', 'F3'));

CREATE TABLE face_revoke_requests (
    request_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id           INTEGER      NOT NULL REFERENCES students (student_id),
    term_id              BIGINT       REFERENCES academic_terms (id) ON DELETE SET NULL,
    school_year          TEXT         NOT NULL,
    semester             TEXT         NOT NULL,
    reason               TEXT         NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 240),
    status               TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    requested_by_user_id INTEGER      NOT NULL REFERENCES user_accounts (user_id),
    reviewed_by_user_id  INTEGER      REFERENCES user_accounts (user_id),
    review_note          TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reviewed_at          TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX face_revoke_requests_one_pending_idx
    ON face_revoke_requests (student_id)
    WHERE status = 'pending';

CREATE INDEX face_revoke_requests_term_approved_idx
    ON face_revoke_requests (student_id, school_year, semester)
    WHERE status = 'approved';

CREATE INDEX face_revoke_requests_status_created_idx
    ON face_revoke_requests (status, created_at DESC);
