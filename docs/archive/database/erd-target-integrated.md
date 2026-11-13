# DentiSys Integrated Target ERD — Phase 2 Baseline

## Entity Catalog (15 application tables)

Total physical tables: 16 (15 application + 1 `_schema_migrations`).

### Identity and RBAC
- `user_accounts` — central identity, profile, role, preferences, account status
- `role_permissions` — denormalized RBAC policy (125 static grants)

### People
- `students` — student identity, demographics, optional user_id FK for secretary activation

### Academic Structure
- `class_sections` — course offerings with instructor, optional secretary, term fields
- `courses` — course catalog with grading_config JSON

### Enrollment and Grading
- `enrollments` — one student in one class-section (final_gwa, retention_state, remedial_state_json)
- `assessments` — assessment/activity definitions linked to cs_id
- `assessment_scores` — individual student scores per assessment
- `attendance_records` — per-student attendance with override fields (enrollment_id authoritative)

### Biometric
- `biometric_profiles` — one row per student, protected template/image references, consent metadata

### Security
- `auth_sessions` — session identity and lifecycle only (issued_token_version, no refresh digests)
- `security_tokens` — universal token store (purpose discriminator, nullable columns per purpose)
- `audit_events` — append-only, MAC-chained audit trail (before/after state JSON + hashes)
- `email_outbox` — outgoing email queue
- `system_settings` — global config store (is_internal for chain head)

### Key Relationships

```
courses 1──< class_sections 1──< enrollments 1──< attendance_records
user_accounts 1──< students (nullable UNIQUE)
user_accounts 1──< auth_sessions 1──< security_tokens
audit_events: chain head stored in system_settings (audit_chain_head)
```

## Consolidation Summary

- 46 Phase 1C business tables → 15 Phase 2 application tables
- Superseded MariaDB migration history archived under `database/archive/mariadb/`
- Clean-install-only baseline: `001_baseline_schema.sql`, `002_seed_rbac.sql`, `003_seed_system_settings.sql`
