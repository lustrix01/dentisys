-- Backlog 9.26: "Remember me" at sign-in.
-- Additive: one new column with a default, so existing sessions stay unremembered. The previous images ignore it.
-- remembered = true means the session has no idle limit; it still ends at its fixed expires_at and on every revocation.
ALTER TABLE auth_sessions ADD COLUMN remembered BOOLEAN NOT NULL DEFAULT false;
