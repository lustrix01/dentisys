-- Audit chain check baseline (SEC-005, R10). backend/bin/audit-verify-chain.php
-- records here, once, the last break it found on its first run against an
-- existing database; later runs fail only on a break after that sequence.
-- The row starts empty (recorded_at null) and is internal like audit_chain_head.
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES ('audit_chain_verified_baseline',
        '{"accepted_break_sequence":null,"recorded_at":null}'::jsonb,
        1,
        'Internal audit chain check baseline.')
ON CONFLICT (setting_key) DO NOTHING;
