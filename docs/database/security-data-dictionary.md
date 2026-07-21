# Security Data Dictionary — Phase 2 Baseline (15 Tables)

## user_accounts

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| login_email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL (PASSWORD_DEFAULT: bcrypt or argon2) |
| role | ENUM('admin','faculty','secretary') | NOT NULL |
| display_name | VARCHAR(255) | NOT NULL |
| title | VARCHAR(255) | NULL |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'Active' |
| token_version | INT UNSIGNED | NOT NULL, DEFAULT 0 (account-wide invalidation) |
| theme | ENUM('light','dark') | NOT NULL, DEFAULT 'light' |
| created_at, updated_at, approved_at, rejected_at, disabled_at | DATETIME(6) | timestamps |

## role_permissions

| Column | Type | Constraints |
|--------|------|-------------|
| rp_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| role_name | ENUM('admin','faculty','secretary') | NOT NULL |
| resource | VARCHAR(100) | NOT NULL |
| action | VARCHAR(50) | NOT NULL |
| scope | ENUM('own','assigned_class','assigned_course','aggregate','system_wide') | NOT NULL |
| | | UNIQUE (role_name, resource, action, scope) |

125 static grants. Missing rows = deny.

## students

| Column | Type | Constraints |
|--------|------|-------------|
| student_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| student_number | VARCHAR(50) | UNIQUE, NOT NULL |
| user_id | INT UNSIGNED | NULL, UNIQUE, FK→user_accounts ON DELETE SET NULL |
| first_name, last_name, middle_name | VARCHAR(100) | NOT NULL (first, last) |
| status | ENUM('active','disabled','archived') | NOT NULL, DEFAULT 'active' |

## class_sections

| Column | Type | Constraints |
|--------|------|-------------|
| cs_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| course_id | INT UNSIGNED | FK→courses RESTRICT |
| instructor_user_id | INT UNSIGNED | FK→user_accounts RESTRICT (authoritative scope source) |
| secretary_user_id | INT UNSIGNED | FK→user_accounts SET NULL |

## enrollments

| Column | Type | Constraints |
|--------|------|-------------|
| enrollment_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| student_id | INT UNSIGNED | FK→students RESTRICT |
| cs_id | INT UNSIGNED | FK→class_sections RESTRICT |
| retention_state | ENUM('active','warning','critical','remedial','archived') | NOT NULL, DEFAULT 'active' |
| final_percentage, final_gwa | DECIMAL | NULL |
| grade_components_json | JSON | NULL |
| remedial_state_json | JSON | NULL |

UNIQUE (student_id, cs_id). Faculty-facing removal = retention_state='archived' (not student deletion).

## assessments

| Column | Type | Constraints |
|--------|------|-------------|
| assessment_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| cs_id | INT UNSIGNED | FK→class_sections RESTRICT |
| status | ENUM('Active','Closed','Archived') | NOT NULL, DEFAULT 'Active' |

Archival replaces deletion when scores exist.

## assessment_scores

| Column | Type | Constraints |
|--------|------|-------------|
| score_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| assessment_id | INT UNSIGNED | FK→assessments RESTRICT |
| student_id | INT UNSIGNED | FK→students RESTRICT |
| score | DECIMAL(6,2) | NOT NULL |

UNIQUE (assessment_id, student_id).

## attendance_records

| Column | Type | Constraints |
|--------|------|-------------|
| record_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| enrollment_id | INT UNSIGNED | FK→enrollments RESTRICT (authoritative relationship) |
| status | ENUM('present','absent','late','excused') | NOT NULL |
| secretary_user_id | INT UNSIGNED | FK→user_accounts SET NULL |
| override_by_user_id | INT UNSIGNED | FK→user_accounts SET NULL |

## biometric_profiles

| Column | Type | Constraints |
|--------|------|-------------|
| profile_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| student_id | INT UNSIGNED | FK→students RESTRICT, UNIQUE (one row per student) |
| consent_status | ENUM('pending','approved','declined') | NOT NULL |
| face_enrolled | TINYINT(1) | NOT NULL, DEFAULT 0 |
| template_reference | VARCHAR(500) | NULL (protected reference, not raw data) |
| image_references | JSON | NULL |

Revocation clears template_reference and image_references, sets revoke_at. Raw templates never returned via human-facing APIs.

## auth_sessions

| Column | Type | Constraints |
|--------|------|-------------|
| session_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| session_uuid | CHAR(36) | UNIQUE, NOT NULL |
| user_id | INT UNSIGNED | FK→user_accounts RESTRICT |
| issued_token_version | INT UNSIGNED | NOT NULL (compared to user_accounts.token_version) |
| expires_at, revoked_at | DATETIME(6) | lifecycle |

Session identity and lifecycle only. Refresh token digests stored in security_tokens.

## security_tokens

| Column | Type | Purpose-Specific Use |
|--------|------|----------------------|
| token_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| purpose | ENUM('mfa_credential','mfa_recovery','password_reset','access_token_blacklist','secretary_invitation','refresh') | NOT NULL |
| user_id | INT UNSIGNED | NULL (nullable for pre-account secretary_invitation) |
| session_id | INT UNSIGNED | FK→auth_sessions (refresh only) |
| related_student_id, related_cs_id | INT UNSIGNED | FK (secretary_invitation only) |
| token_digest | BINARY(32) | NULL, UNIQUE (refresh, password_reset, blacklist, invitation) |
| secret_hash | VARCHAR(255) | NULL (mfa_recovery: PASSWORD_DEFAULT hash) |
| family_uuid | CHAR(36) | NULL (refresh only) |
| parent_token_id | INT UNSIGNED | NULL, UNIQUE (refresh lineage) |
| ciphertext, nonce, auth_tag | VARBINARY(16-255) | NULL (mfa_credential only) |
| last_accepted_step | BIGINT UNSIGNED | NULL (mfa_credential only, TOTP replay protection) |
| used_at | DATETIME(6) | NULL (consumption timestamp) |
| metadata_json | JSON | NULL (purpose-specific data) |

Recovery codes marked used_at on consumption, never deleted.

## audit_events

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| event_uuid | CHAR(36) | UNIQUE, NOT NULL |
| sequence_number | BIGINT UNSIGNED | UNIQUE, NOT NULL |
| before_state_json | LONGTEXT | NULL (redacted canonical JSON) |
| after_state_json | LONGTEXT | NULL (redacted canonical JSON) |
| before_state_hash | BINARY(32) | NULL (SHA-256 of redacted before JSON) |
| after_state_hash | BINARY(32) | NULL (SHA-256 of redacted after JSON) |
| previous_event_mac | BINARY(32) | NOT NULL |
| event_mac | BINARY(32) | NOT NULL |
| mac_key_version | INT UNSIGNED | NOT NULL |
| canonical_schema_version | INT UNSIGNED | NOT NULL |

Immutability: UPDATE and DELETE rejected by triggers. Actor + session FKs use ON DELETE SET NULL.

## email_outbox

| Column | Type | Constraints |
|--------|------|-------------|
| email_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| sender_user_id | INT UNSIGNED | FK→user_accounts SET NULL |
| status | ENUM('Pending','Sent','Failed') | NOT NULL |
| operation_uuid | CHAR(36) | UNIQUE |

## system_settings

| Column | Type | Constraints |
|--------|------|-------------|
| setting_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| setting_key | VARCHAR(100) | UNIQUE, NOT NULL |
| setting_value | JSON | NOT NULL |
| is_internal | TINYINT(1) | NOT NULL, DEFAULT 0 |

Internal rows (audit_chain_head) protected by triggers: setting_key and is_internal immutable. Delete blocked by trigger. Generic settings API must exclude is_internal=1 rows.

## Token Digests

- All token digests for random tokens (refresh, password_reset, access_token_blacklist, secretary_invitation): SHA-256, stored as BINARY(32).
- Recovery code hashes: PASSWORD_DEFAULT, stored as VARCHAR(255).
- MFA credential secrets: AES-256-GCM encrypted, stored as ciphertext/nonce/auth_tag.
