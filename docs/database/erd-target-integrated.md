# DentiSys Integrated Target ERD — Phase 1C

## Legend

- `[E]` Existing (migrations 001–048)
- `[E+]` Existing, extended via ALTER
- `[1C]` New Phase 1C academic entity
- `[S]` New SAD/IAS security entity

## Entity Catalog (46 business tables)

### Identity and RBAC
- `user_account` [E+] — login_email, role_id FK, token_version, timestamps added
- `access_role` [S] — admin, faculty, secretary
- `permission` [S] — 66 permission codes
- `role_permission` [S] — 117 bindings with scope_type

### Academic Structure
- `academic_term` [1C] — year/semester with unique constraint
- `course` [E] — unchanged
- `course_component` [E] — unchanged (lab_weight, lec_weight)
- `component` [E+] — ct_id FK→component_type
- `component_type` [1C] — 8 paper-defined categories with domain
- `class_section` [E+] — term_id FK→academic_term

### People
- `student` [E] — unchanged
- `student_user_account` [1C] — 1:1 mapping
- `faculty` [E+] — uq_faculty_user_id added
- `user_preference` [1C] — per-user theme

### Enrollment and Grading
- `enrollment` [E] — unchanged (cs_id gives term through class_section)
- `assessment` [E] — unchanged
- `student_assessment_grade` [E] — unchanged
- `student_term_grade` [E] — unchanged (stg_id referenced by retention_case)

### Attendance
- `attendance_session` [E] — unchanged
- `device` [E+] — device_type added
- `attendance_record` [E] — unchanged
- `attendance_override` [1C] — immutable overrides with operation_uuid

### Retention and Remedial
- `retention_policy` [1C] — active-key generated
- `retention_policy_version` [1C] — threshold operators
- `retention_case` [1C] — stg_id FK→student_term_grade
- `retention_record` [E] — legacy, unchanged
- `remedial_attempt` [1C] — typed attempts, immutable on completion
- `remedial_log` [E] — legacy, unchanged
- `retention_risk` [E] — unchanged

### Biometric
- `student_image` [E] — unchanged
- `facial_template` [E] — unchanged (raw LBPH vectors)
- `biometric_consent` [1C] — historical rows with current key

### Workflow
- `faculty_approval` [S] — immutable on decision
- `secretary_invitation` [S] — active-pending key, identity validation trigger
- `secretary_assignment` [S] — active key, sua_id chain

### Security
- `mfa_credential` [S] — AES-256-GCM ciphertext
- `mfa_recovery_code` [S] — bcrypt hashes
- `auth_session` [S] — device-aware
- `refresh_token` [S] — family, parent UNIQUE
- `access_token_revocation` [S] — JTI digests
- `password_reset_token` [S] — single-use
- `auth_throttle` [S] — scoped-hash
- `audit_chain` [S] — partitioned MAC state
- `audit_event` [S] — immutable, insert-time MAC
- `audit_log` [E] — legacy, preserved unchanged
- `email_delivery` [S] — immutable on terminal

### Key Relationships

```
academic_term 1──< class_section 1──< enrollment 1──< student_term_grade 1──< retention_case
student 1──< student_user_account (1:1) ──< secretary_assignment
user_account 1──< auth_session 1──< refresh_token (self-ref)
audit_chain 1──< audit_event
```
