-- BIO-009 (backlog 12.2): possible face-enrolment abuse is flagged for the Dean without blocking anything (docs/contracts/face-reenrolment.md section 6).
-- Additive: one new table. detail holds dates only, never a score or a template.
CREATE TABLE face_enrolment_flags (
    flag_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id        INTEGER      NOT NULL REFERENCES students (student_id),
    kind              TEXT         NOT NULL CHECK (kind IN ('F1', 'F2')),
    status            TEXT         NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'revoked')),
    detail            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_at         TIMESTAMPTZ,
    closed_by_user_id INTEGER      REFERENCES user_accounts (user_id),
    closed_note       TEXT
);
CREATE INDEX face_enrolment_flags_status_idx ON face_enrolment_flags (status, updated_at DESC);
CREATE INDEX face_enrolment_flags_student_idx ON face_enrolment_flags (student_id, kind) WHERE status = 'open';
