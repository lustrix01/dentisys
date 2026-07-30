# Requirements Traceability Matrix — Phase 2 Baseline

## Source Register

| Source ID | Source | Type | Repository status |
|---|---|---|---|
| SRC-CAP-SAD | Owner-provided capstone/SAD paper | Archived owner source | docs/database/erd-sources/ |
| SRC-ERD-1A/1B | Owner-designated ERD images | Archived owner source | docs/database/erd-sources/ |
| SRC-PHASE-1-RECON | Phase 1 source reconciliation | Repository documentation | docs/database/ |
| SRC-PLAINTEXT | Phase 1 authoritative plaintext transcription | Repository documentation | docs/database/erd-sources/ |
| SRC-IAS-A | IAS Module A specification | External owner source | Requirements from approved execution prompt |
| SRC-IAS-C | IAS Module C specification | External owner source | Requirements from approved execution prompt |
| SRC-REPO-DOCS | Existing repository documentation | Repository evidence | README, docs/ |
| SRC-FE-PROTO | Existing frontend prototype | Repository evidence | frontend/src/ |
| SRC-BE-DB | Existing backend and database | Repository evidence | backend/, database/ |

## Status Values

- `Confirmed`: confirmed as a requirement or architecture fact
- `Prototype Only`: frontend mock/localStorage only
- `Documented Future Requirement`: documented as future work
- `Missing`: not found in repository evidence
- `Owner Decision Required`: cannot be finalized without Owner approval

## Capstone and SAD Requirements

| ID | Description | Status | Phase 2 Evidence |
|---|---|---|---|
| CAP-SAD-001 to 007 | Grading and assessment | Prototype Only | Phase 2 schema (assessments, assessment_scores, enrollments, courses) |
| CAP-SAD-008 | Student enrollment | Prototype Only | Phase 2 schema (students, enrollments) |
| CAP-SAD-009 | Retention monitoring | Prototype Only | Phase 2 schema (enrollments.retention_state) |
| CAP-SAD-010 to 012 | Remedial and cost recovery | Documented Future | Phase 2 schema (enrollments.remedial_state_json) |
| CAP-SAD-013 | Retention status history | Prototype Only | Phase 2 schema (audit_events) |
| CAP-SAD-014 to 017 | Random Forest, facial recognition | Documented Future | Phase 2 schema (biometric_profiles) |
| CAP-SAD-018 | Facial template storage | Documented Future | Phase 2 schema (biometric_profiles.template_reference) |
| CAP-SAD-019 | Biometric consent | Prototype Only | Phase 2 schema (biometric_profiles.consent_status) |
| CAP-SAD-020 to 023 | Attendance | Prototype Only | Phase 2 schema (attendance_records) |
| CAP-SAD-024 | Retention/remedial reports | Documented Future | Covered by audit_events + enrollments design |
| CAP-SAD-025 | Admin workflows | Prototype Only | Phase 2 RBAC (62 admin grants) |
| CAP-SAD-026 | Faculty workflows | Prototype Only | Phase 2 RBAC (47 faculty grants); enrollments.archive for delete |
| CAP-SAD-027 | Secretary workflows | Prototype Only | Phase 2 RBAC (16 secretary grants, least-privilege) |
| CAP-SAD-028 | Student actions | Documented Future | Phase 2 schema (students.user_id for secretary activation) |

## IAS Module A Requirements

| ID | Description | Status | Phase 2 Evidence |
|---|---|---|---|
| IAS-A-001 | TOTP MFA | Documented Future | Phase 2 schema (security_tokens.purpose=mfa_credential, mfa_recovery) |
| IAS-A-002 | TOTP secret provisioning | Documented Future | AES-256-GCM ciphertext design documented |
| IAS-A-003 | TOTP enrollment flow | Documented Future | docs/ias/module-a-identity-access.md flow diagram |
| IAS-A-004 | TOTP verification and validation | Documented Future | matched_step replay protection documented |
| IAS-A-005 | Strict RBAC | Documented Future | Phase 2 schema (role_permissions, 125 static grants) |
| IAS-A-006 | RBAC matrix | Confirmed | 125-row matrix in docs/ias/module-a-identity-access.md |
| IAS-A-007 | Hashing/MAC rationale | Confirmed | Documented in design rationale section |
| IAS-A-008 | Authentication rationale | Confirmed | JWT, refresh rotation, token_version documented |
| IAS-A-009 | Privilege rationale | Confirmed | Least-privilege, scope derivation from class_sections FKs |

## IAS Module C Requirements

| ID | Description | Status | Phase 2 Evidence |
|---|---|---|---|
| IAS-C-001 | Rate limiting | Documented Future | Design in docs/ias/module-c-perimeter-defense.md; system_settings seeds |
| IAS-C-002 | JWT rotation | Documented Future | security_tokens.purpose=refresh design |
| IAS-C-003 | JWT revocation | Documented Future | token_version invalidation design |
| IAS-C-004 | Input validation | Documented Future | Validate allowlist strategy documented |
| IAS-C-005 | Input sanitization | Documented Future | Sanitization rules documented |
| IAS-C-006 | Parameterized queries | Documented Future | PDO native prepares documented; no business queries yet |
| IAS-C-007 | Extended ACL | Confirmed | Cisco ACL artifact in docs/ias/module-c-perimeter-defense.md |
| IAS-C-008 | Wildcard masks | Confirmed | Cisco wildcard masks used in ACL (0.0.0.31, 0.0.0.0 for host) |
| IAS-C-009 | Endpoint control table | Confirmed | Complete endpoint table in docs/ias/module-c-perimeter-defense.md |
| IAS-C-010 | OWASP rationale | Confirmed | OWASP Top 10:2025 mappings documented |
| IAS-C-011 | Network-layer restrictions | Documented Only | ACL artifact is documentation-only |

## Audit Requirements

| ID | Description | Status | Phase 2 Evidence |
|---|---|---|---|
| AUR-001 | Append-only audit | Confirmed | audit_events with no-update/no-delete triggers |
| AUR-002 | MAC-chained events | Confirmed | HMAC-SHA-256 chain via system_settings.audit_chain_head |
| AUR-003 | Before/after state | Confirmed | before_state_json, after_state_json with redaction rules |
| AUR-004 | Canonical serialization | Confirmed | Deterministic key-ordered JSON documented |
| AUR-005 | Chain verification | Documented Future | Verification test planned for later stage |
| AUR-006 | Server-derived events | Documented Future | Backend creates audit in same transaction |
| AUR-007 | Restricted querying | Documented Future | Role-filtered audit API planned |

## Phase 2 Status Summary

- **15 application tables**: user_accounts, role_permissions, students, class_sections, courses, enrollments, assessments, assessment_scores, attendance_records, biometric_profiles, auth_sessions, security_tokens, audit_events, email_outbox, system_settings
- **16 total physical tables** (15 + _schema_migrations)
- **125 static RBAC grants** across admin (62), faculty (47), secretary (16)
- **5 system settings rows** (audit_chain_head, retention_policy, grading_defaults, rate_limit_defaults, devices)
- **Superseded MariaDB migration history** archived under `database/archive/mariadb/`
- **Clean-install-only baseline**: 001_baseline_schema.sql, 002_seed_rbac.sql, 003_seed_system_settings.sql
- **All backend and frontend runtime files unchanged** in Stage 1
