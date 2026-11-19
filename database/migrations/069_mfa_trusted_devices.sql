-- Backlog 9.24 (AUTH-006): "Remember this device" for the 2FA code at sign-in.
-- Additive: one new table, no change to existing rows. The previous images never read it.
-- token_hash is the SHA-256 of the cookie value (the value itself is never stored).
-- token_version is the account's token_version when the device was remembered; a later bump makes the row stop matching.
CREATE TABLE mfa_trusted_devices (
    device_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES user_accounts(user_id) ON DELETE CASCADE,
    token_hash     CHAR(64)     NOT NULL,
    token_version  INTEGER      NOT NULL,
    user_agent     VARCHAR(255),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ  NOT NULL,
    last_used_at   TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    revoked_reason VARCHAR(40),
    CONSTRAINT uq_mfa_trusted_devices_token_hash UNIQUE (token_hash)
);

CREATE INDEX ix_mfa_trusted_devices_user ON mfa_trusted_devices(user_id);
