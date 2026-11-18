-- Backlog 13.9 (docs/contracts/dean-superadmin-split.md DS1-DS2): the Superadmin is its own role and account.
-- DS4 (identity rules) lives in PHP: account_identity_email_role_conflict() in backend/app/account_identity.php treats superadmin as staff.
-- Additive: no row changes. The role checks gain 'superadmin', and the database refuses a second Superadmin.
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS ck_user_accounts_role;
ALTER TABLE user_accounts
    ADD CONSTRAINT ck_user_accounts_role
    CHECK (role IN ('superadmin', 'admin', 'faculty', 'secretary', 'student'));

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS ck_role_permissions_role;
ALTER TABLE role_permissions
    ADD CONSTRAINT ck_role_permissions_role
    CHECK (role_name IN ('superadmin', 'admin', 'faculty', 'secretary', 'student'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_accounts_one_superadmin
    ON user_accounts ((role)) WHERE role = 'superadmin';
