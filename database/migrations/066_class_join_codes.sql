-- CLS-004 (backlog 12.4): join a class by code (docs/contracts/class-join-code.md).
-- Additive: three class_sections columns and one table. join_code is created lazily by the server.
ALTER TABLE class_sections
    ADD COLUMN join_code          VARCHAR(6) NULL,
    ADD COLUMN join_code_enabled  BOOLEAN    NOT NULL DEFAULT true,
    ADD COLUMN join_auto_approve  BOOLEAN    NOT NULL DEFAULT false;
CREATE UNIQUE INDEX class_sections_join_code_idx ON class_sections (join_code) WHERE join_code IS NOT NULL;

CREATE TABLE class_join_requests (
    request_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cs_id                INTEGER     NOT NULL REFERENCES class_sections (cs_id),
    student_id           INTEGER     NOT NULL REFERENCES students (student_id),
    requested_by_user_id INTEGER     NOT NULL REFERENCES user_accounts (user_id),
    status               TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at           TIMESTAMPTZ,
    decided_by_user_id   INTEGER     REFERENCES user_accounts (user_id)
);
CREATE UNIQUE INDEX class_join_requests_pending_idx ON class_join_requests (cs_id, student_id) WHERE status = 'pending';
CREATE INDEX class_join_requests_student_idx ON class_join_requests (student_id) WHERE status = 'pending';
