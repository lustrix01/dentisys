# Phase 2 Migration Mapping

## Overview

Phase 2 reduces the DentiSys database from 46 business tables (Phase 1C) to 15 application tables, while meeting SAD and IAS requirements for auditability, TOTP MFA, RBAC, JWT sessions, rate limiting, input validation, and ACL documentation.

**Total physical tables**: 16 (15 application + 1 `_schema_migrations`)

Exact count: 16 total physical tables. Migration `006_remove_email_code_2fa.sql` retires email-code 2FA data and schema support while preserving the 15-table application baseline.

**Clean-install-only baseline**: 001_baseline_schema.sql, 002_seed_rbac.sql, 003_seed_system_settings.sql

## Old-to-New Entity Mapping

| Phase 1C Table(s) (46 total) | Phase 2 Table (15 total) | Consolidation |
|---|---|---|
| user_account, user_preference, faculty | user_accounts | Profile, theme, faculty fields merged |
| access_role, permission, role_permission | role_permissions | Denormalized 125-row RBAC seed |
| student, student_user_account | students | user_id FK (nullable, secretary link) |
| class_section, academic_term | class_sections | Term columns inline |
| course, course_component, component, component_type | courses | grading_config JSON |
| enrollment, student_term_grade, retention_record, retention_case, remedial_attempt, remedial_log, retention_risk | enrollments | Scalar grade fields, retention_state, remedial_state_json |
| assessment | assessments | cs_id linked |
| student_assessment_grade | assessment_scores | Renamed for clarity |
| attendance_session, attendance_record, attendance_override | attendance_records | enrollment_id authoritative, override columns |
| student_image, facial_template, biometric_consent | biometric_profiles | UNIQUE(student_id), protected references |
| auth_session | auth_sessions | Session identity only; no refresh digests. issued_token_version added. |
| mfa_credential, mfa_recovery_code, password_reset_token, access_token_revocation, secretary_invitation, refresh_token | security_tokens | Purpose discriminator, nullable purpose-specific columns |
| audit_chain, audit_event, audit_log | audit_events | before_state_json/after_state_json, MAC chaining via system_settings chain head |
| email_delivery | email_outbox | Renamed |
| retention_policy, retention_policy_version, device, auth_throttle (config) | system_settings | Key-value store; is_internal marker for chain head |
| secretary_assignment | merged into class_sections.secretary_user_id | FK on class_sections |
| faculty_approval | merged into user_accounts.status + audit_events | Decision history in audit |
| auth_throttle (runtime) | N/A — filesystem rate limiter | Runtime counters not stored in DB |

## Legacy Migration Classification

Superseded Phase 1A/1B/1C migrations were removed during the PostgreSQL cutover. The active PostgreSQL migration directory contains:

- 001_baseline_schema.sql — 15 application tables + _schema_migrations
- 002_seed_rbac.sql — 125 static RBAC grants
- 003_seed_system_settings.sql — 5 reserved system setting rows

## Key Design Decisions

- **No JSON assignment fields**: Authorization derives assigned_class scope from class_sections.instructor_user_id and class_sections.secretary_user_id (not user_accounts JSON).
- **Audit chain head in system_settings**: Reserved internal row `audit_chain_head` tracks latest_sequence and latest_mac.
- **Recovery codes use PASSWORD_DEFAULT**: Stored in security_tokens.secret_hash, marked used_at on consumption.
- **Challenge JWTs**: Short-lived (5 min), purpose-separated, attempt-limited by future filesystem rate limiter using challenge JTI as part of the key.
- **Faculty delete = enrollment archive**: retention_state='archived' on the enrollment row (not student disable).
