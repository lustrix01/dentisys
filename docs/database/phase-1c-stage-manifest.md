# Phase 1C Stage Manifest

## Authority

| Property | Value |
|----------|-------|
| Preceding stage | Phase 1B (migrations 001-048, 20 business tables) |
| Owner approval record | `docs/database/phase-1c-owner-approval-record.md` |
| MariaDB target | 10.4.32, InnoDB, utf8mb4, utf8mb4_unicode_ci |

## Migration Inventory

32 additive migration files (049-080).

### Academic Corrections (049-060)

| # | File | Operation |
|---|------|-----------|
| 049 | 049_phase_1c_component_type.sql | CREATE component_type + seed 8 rows |
| 050 | 050_phase_1c_alter_component.sql | ALTER component (ct_id FK + alias backfill) |
| 051 | 051_phase_1c_academic_term.sql | CREATE academic_term |
| 052 | 052_phase_1c_alter_class_section.sql | ALTER class_section (term_id FK + backfill) |
| 053 | 053_phase_1c_retention_policy.sql | CREATE retention_policy + active key |
| 054 | 054_phase_1c_retention_policy_version.sql | CREATE retention_policy_version |
| 055 | 055_phase_1c_retention_case.sql | CREATE retention_case |
| 056 | 056_phase_1c_remedial_attempt.sql | CREATE remedial_attempt + 2 triggers |
| 057 | 057_phase_1c_student_user_account.sql | CREATE student_user_account |
| 058 | 058_phase_1c_attendance_override.sql | CREATE attendance_override + 2 triggers |
| 059 | 059_phase_1c_biometric_consent.sql | CREATE biometric_consent + current key |
| 060 | 060_phase_1c_user_preference.sql | CREATE user_preference |

### Security and Identity (061-080)

| # | File | Operation |
|---|------|-----------|
| 061 | 061_phase_1c_access_role.sql | CREATE access_role |
| 062 | 062_phase_1c_permission.sql | CREATE permission |
| 063 | 063_phase_1c_role_permission.sql | CREATE role_permission |
| 064 | 064_phase_1c_seed_rbac.sql | INSERT 3 roles + 66 permissions + 117 bindings |
| 065 | 065_phase_1c_alter_user_account.sql | ALTER user_account (login_email, role_id, token_version, timestamps) |
| 066 | 066_phase_1c_alter_faculty.sql | ALTER faculty (uq_faculty_user_id) |
| 067 | 067_phase_1c_alter_device.sql | ALTER device (device_type) |
| 068 | 068_phase_1c_faculty_approval.sql | CREATE faculty_approval + 2 triggers |
| 069 | 069_phase_1c_secretary_invitation.sql | CREATE secretary_invitation + active key + validation trigger |
| 070 | 070_phase_1c_secretary_assignment.sql | CREATE secretary_assignment + active key |
| 071 | 071_phase_1c_mfa_credential.sql | CREATE mfa_credential + active key |
| 072 | 072_phase_1c_mfa_recovery_code.sql | CREATE mfa_recovery_code |
| 073 | 073_phase_1c_auth_session.sql | CREATE auth_session |
| 074 | 074_phase_1c_refresh_token.sql | CREATE refresh_token |
| 075 | 075_phase_1c_access_token_revocation.sql | CREATE access_token_revocation |
| 076 | 076_phase_1c_password_reset_token.sql | CREATE password_reset_token |
| 077 | 077_phase_1c_auth_throttle.sql | CREATE auth_throttle |
| 078 | 078_phase_1c_audit_chain.sql | CREATE audit_chain |
| 079 | 079_phase_1c_audit_event.sql | CREATE audit_event + 2 triggers |
| 080 | 080_phase_1c_email_delivery.sql | CREATE email_delivery + 2 triggers |

## Object Counts After Phase 1C

- 46 business tables
- 47 total tables (incl. _schema_migrations)
- 11 triggers
- 3 access_role rows
- 66 permission rows
- 117 role_permission rows
- 8 component_type rows

## New Concepts

- Academic term identity with semester/year uniqueness
- Controlled grading-component taxonomy (8 categories, lecture/lab domains)
- Retention cases linked to triggering term-grade evidence
- Typed remedial attempts (first/second/cost-recovery) with immutability
- Immutable attendance overrides with operation UUID correlation
- Historical biometric consent with current-key generated column
- Per-user theme preferences
- Normalized scoped RBAC (role + permission + scope-type)
- Faculty approval history with generated active-pending key
- Secretary invitation with identity validation trigger
- Secretary assignment through student-user-account chain
- TOTP MFA with AES-256-GCM ciphertext storage
- Server-side auth sessions with device attribution
- Refresh-token family with parent uniqueness
- Access-token JTI revocation with session linkage
- Password-reset tokens with single-use state
- Scoped-hash authentication throttling
- Partitioned audit chain with insert-time MAC event immutability
- Email delivery attempts with terminal-state immutability
