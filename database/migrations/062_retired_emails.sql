-- ADM-001 (backlog 12.1): an address an account was moved away from is retired for good (docs/contracts/roles.md section 6).
-- Additive: one new table. Only backend/bin/account-admin.php unretire-email deletes a row.
CREATE TABLE retired_emails (
    email      CITEXT       PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES user_accounts (user_id),
    retired_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reason     TEXT
);
