-- Preserve Faculty structured names for invitations without rewriting legacy display names.
-- Existing combined display_name values remain authoritative until explicitly edited.

ALTER TABLE user_accounts
    ADD COLUMN IF NOT EXISTS name_prefix VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS name_suffix VARCHAR(50) NULL;
