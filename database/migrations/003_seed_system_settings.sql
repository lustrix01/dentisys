-- =============================================================================
-- DentiSys System Settings Seed — 5 reserved rows
-- Static reference data only.  No users, passwords, tokens, or secrets.
-- =============================================================================

-- 1. Audit chain head — internal, manages MAC verification state
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'audit_chain_head',
    JSON_OBJECT(
        'latest_sequence', 0,
        'latest_mac', '0000000000000000000000000000000000000000000000000000000000000000'
    ),
    1,
    'Audit chain head: the latest sequence number and event MAC. Locked with SELECT FOR UPDATE during audited writes. Updated atomically on every audited transaction. Internal system row — not exposed through the generic settings API.'
);

-- 2. Retention policy — default thresholds for academic retention
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'retention_policy',
    JSON_OBJECT(
        'retention_threshold', 2.5,
        'clinical_passing_limit', 2.5,
        'initial_trigger_operator', 'GT',
        'initial_trigger_grade', 2.5,
        'first_remedial_pass_gwa_cap', 2.5,
        'second_remedial_pass_gwa_cap', 3.0,
        'cost_recovery_pass_gwa_cap', 3.0,
        'cost_recovery_pass_percentage', 75.0,
        'higher_numeric_grade_is_worse', true
    ),
    0,
    'Academic retention policy thresholds, triggers, and remedial pass grade caps.'
);

-- 3. Grading defaults — default component weights for courses
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'grading_defaults',
    JSON_OBJECT(
        'default_weights',
        JSON_OBJECT(
            'quizzes', 20,
            'exams', 30,
            'practicum', 40,
            'attendance', 10
        ),
        'total_weight_required', 100,
        'retention_gwa_threshold', 2.5,
        'passing_percentage', 75.0,
        'gwa_scale',
        JSON_ARRAY(
            JSON_OBJECT('min_pct', 97, 'gwa', 1.0, 'description', 'Excellent'),
            JSON_OBJECT('min_pct', 94, 'gwa', 1.25, 'description', 'Very Good'),
            JSON_OBJECT('min_pct', 91, 'gwa', 1.5, 'description', 'Very Good'),
            JSON_OBJECT('min_pct', 88, 'gwa', 1.75, 'description', 'Good'),
            JSON_OBJECT('min_pct', 85, 'gwa', 2.0, 'description', 'Good'),
            JSON_OBJECT('min_pct', 82, 'gwa', 2.25, 'description', 'Satisfactory'),
            JSON_OBJECT('min_pct', 80, 'gwa', 2.5, 'description', 'Satisfactory'),
            JSON_OBJECT('min_pct', 78, 'gwa', 2.75, 'description', 'Fair'),
            JSON_OBJECT('min_pct', 75, 'gwa', 3.0, 'description', 'Passing'),
            JSON_OBJECT('min_pct', 0, 'gwa', 5.0, 'description', 'Failure')
        )
    ),
    0,
    'Default grading weights, GWA transmutation scale, and retention threshold.'
);

-- 4. Rate-limit defaults — endpoint-specific thresholds
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'rate_limit_defaults',
    JSON_OBJECT(
        'enabled', true,
        'limits',
        JSON_ARRAY(
            JSON_OBJECT('endpoint', 'POST /api/auth/login', 'window_seconds', 900, 'max_requests', 5, 'tier', 'ip'),
            JSON_OBJECT('endpoint', 'POST /api/auth/register', 'window_seconds', 3600, 'max_requests', 3, 'tier', 'ip'),
            JSON_OBJECT('endpoint', 'POST /api/auth/password/reset-request', 'window_seconds', 900, 'max_requests', 3, 'tier', 'ip'),
            JSON_OBJECT('endpoint', 'POST /api/auth/password/reset-confirm', 'window_seconds', 900, 'max_requests', 5, 'tier', 'ip'),
            JSON_OBJECT('endpoint', 'POST /api/auth/mfa/verify', 'window_seconds', 300, 'max_requests', 10, 'tier', 'user'),
            JSON_OBJECT('endpoint', 'POST /api/auth/mfa/recover', 'window_seconds', 900, 'max_requests', 5, 'tier', 'user'),
            JSON_OBJECT('endpoint', 'POST /api/auth/refresh', 'window_seconds', 60, 'max_requests', 30, 'tier', 'session'),
            JSON_OBJECT('endpoint', 'POST /api/scores/bulk', 'window_seconds', 60, 'max_requests', 10, 'tier', 'user'),
            JSON_OBJECT('endpoint', 'GET *', 'window_seconds', 60, 'max_requests', 120, 'tier', 'user'),
            JSON_OBJECT('endpoint', 'POST/PATCH/PUT/DELETE *', 'window_seconds', 60, 'max_requests', 60, 'tier', 'user')
        ),
        'storage_directory', 'backend/storage/ratelimit'
    ),
    0,
    'Rate-limit configuration: per-endpoint thresholds, window sizes, and tier type. Runtime state is filesystem-based, not stored in this table.'
);

-- 5. Devices — CCTV/camera/attendance terminal metadata registry
INSERT INTO system_settings (setting_key, setting_value, is_internal, description)
VALUES (
    'devices',
    JSON_OBJECT(
        'registry',
        JSON_ARRAY(
            JSON_OBJECT('id', 'CCTV-CLINIC-A-01', 'type', 'camera', 'location', 'Clinic A', 'status', 'active'),
            JSON_OBJECT('id', 'CCTV-CLINIC-B-01', 'type', 'camera', 'location', 'Clinic B', 'status', 'active'),
            JSON_OBJECT('id', 'TERM-CLINIC-A-01', 'type', 'terminal', 'location', 'Clinic A', 'status', 'active')
        )
    ),
    0,
    'Device/CCTV metadata registry. Reference data only — actual device integration is future work.'
);
